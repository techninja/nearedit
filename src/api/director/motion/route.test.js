import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { getAction } from '#utils/director/actions.js';
import { applyDirectorResult } from '#utils/edl/apply.js';
import { createEdl } from '#utils/edl/factory.js';
import { validateEdl } from '#utils/edl/validate.js';
import { directorRouter } from '../../director.js';
import { getJob } from '../../lib/jobs.js';
import { HANDLERS, jobLabel, usesLlm } from '../run.js';
import { createProject } from '../testing/fixtures.js';
import { checkResult } from '../testing/invariants.js';

// A project without a single media file, with a vertical timeline.
let project;
let server;
let base;
before(async () => {
  project = await createProject({}, { resolution: '1080x1920', aspectRatio: '9:16' });
  process.env.LLM_PROVIDER = 'none';
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', directorRouter);
  await new Promise((resolve) => (server = app.listen(0, '127.0.0.1', resolve)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  project.cleanup();
});

async function post(directive, extra = {}) {
  const res = await fetch(`${base}/director`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: project.projectId,
      adaptationId: project.adaptationId,
      directive: { action: 'motion_piece', ...directive },
      ...extra,
    }),
  });
  return { status: res.status, body: await res.json() };
}
async function finished(jobId) {
  for (let i = 0; i < 400; i++) {
    const job = getJob(jobId);
    if (['complete', 'error', 'cancelled'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error('job did not finish');
}
const BRIEF = 'Made from nothing | no footage, only layers\nStart here';

test('the action is registered: served to the form and dispatched by the job', async () => {
  const { data } = await (await fetch(`${base}/director/actions`)).json();
  const served = data.find((action) => action.id === 'motion_piece');
  assert.deepEqual(served, JSON.parse(JSON.stringify(getAction('motion_piece'))));
  assert.equal(served.title, 'Motion piece');
  assert.equal(typeof HANDLERS.motion_piece, 'function');
  const prepared = (/** @type {object} */ params) =>
    /** @type {any} */ ({ action: served, directive: { prompt: BRIEF, params } });
  assert.equal(usesLlm(prepared({ useLlm: false })), false);
  assert.equal(usesLlm(prepared({ useLlm: true })), true);
  assert.equal(
    jobLabel(prepared({})),
    'Motion piece: Made from nothing | no footage, only layers Start here',
  );
});

test('POST /director builds a piece for the adaptation’s format in a project with no media', async () => {
  const { status, body } = await post({ prompt: BRIEF, params: { theme: 'sunrise' } });
  assert.equal(status, 202);
  const job = await finished(body.jobId);
  assert.equal(job.status, 'complete', job.error);
  assert.equal(job.type, 'director');
  const { result } = job;
  assert.deepEqual(checkResult(result, { fps: 30 }), []);
  assert.equal(result.mode, 'replace');
  assert.match(result.summary, /^Motion piece “Sunrise”: 2 scenes/);
  assert.match(result.notes.join('\n'), /Laid out for 1080×1920 at 30 fps/);
  const out = applyDirectorResult(createEdl({ resolution: '1080x1920' }), result);
  assert.deepEqual(validateEdl(out).problems, []);
  const title = result.tracks[0].clips[0];
  assert.ok(title.text.maxWidth <= 1080 * 0.84 + 1, 'wrapped for the narrow frame');
  assert.match(job.log.at(-1), /^Motion piece “Sunrise”/);
});

test('an empty brief is a 422 with the field named, and no job', async () => {
  for (const prompt of [undefined, '   ', '-\n-']) {
    const { status, body } = await post({ prompt });
    assert.equal(status, 422);
    assert.match(body.error, /Write a brief for the piece first/);
    assert.match(body.detail, /One line per scene/);
    assert.deepEqual(body.fields, { prompt: 'The brief is empty' });
    assert.equal(body.jobId, undefined);
  }
  const bad = await post({ prompt: BRIEF, params: { theme: 'vaporwave', seed: 'x' } });
  assert.equal(bad.status, 422);
  assert.match(bad.body.fields['params.theme'], /Theme must be one of: brand, auto, midnight/);
  assert.match(bad.body.fields['params.seed'], /must be a number/);
});

test('in range mode the piece fills the range unless a length is given', async () => {
  const context = { range: { start: 3, end: 10 } };
  const filled = await finished((await post({ prompt: BRIEF, mode: 'range', context })).body.jobId);
  assert.equal(filled.result.duration, 7);
  assert.deepEqual(filled.result.range, { start: 3, end: 10 });
  const form = { prompt: BRIEF, mode: 'range', context, params: { duration: 0 } };
  assert.equal(
    (await finished((await post(form)).body.jobId)).result.duration,
    7,
    'as the form sends it',
  );
  const given = { prompt: BRIEF, mode: 'range', context, params: { duration: 12 } };
  assert.equal((await finished((await post(given)).body.jobId)).result.duration, 12);
});

test('asking for the LLM while none is configured still gives a piece, and says so', async () => {
  const { status, body } = await post({ prompt: BRIEF, params: { useLlm: true } });
  assert.equal(status, 202, 'an optional LLM never blocks the request');
  const job = await finished(body.jobId);
  assert.equal(job.status, 'complete', job.error);
  assert.match(job.result.notes[0], /The LLM could not write the plan \(No LLM provider/);
  assert.deepEqual(
    job.result.plan.scenes.map((scene) => scene.title),
    ['Made from nothing', 'Start here'],
  );
});
