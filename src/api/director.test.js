import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import express from 'express';
import { directorRouter } from './director.js';
import { startFakeLlm } from './director/testing/fakeLlm.js';
import { checkResult } from './director/testing/invariants.js';
import { createParkProject } from './director/testing/park.js';
import { doc, pair } from './director/testing/timeline.js';
import { cancelJob, getJob, subscribe, summarize } from './lib/jobs.js';

let park;
let fake;
let server;
let base;
const updates = [];
before(async () => {
  park = await createParkProject();
  fake = await startFakeLlm();
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', directorRouter);
  await new Promise((resolve) => (server = app.listen(0, '127.0.0.1', resolve)));
  base = `http://127.0.0.1:${server.address().port}/api`;
  subscribe((message) => updates.push(JSON.parse(message).job));
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fake.close();
  park.cleanup();
});

/** Point the server's LLM settings at the fake server, a dead port, or nothing. */
function useLlm(mode) {
  process.env.LLM_PROVIDER = mode === 'none' ? 'none' : 'ollama';
  process.env.LLM_URL = mode === 'fake' ? fake.url : 'http://127.0.0.1:9';
  process.env.LLM_MODEL = 'test-model';
}
async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
const request = (directive, extra = {}) => ({
  projectId: park.projectId,
  adaptationId: park.adaptationId,
  directive,
  ...extra,
});
async function finished(jobId) {
  for (let i = 0; i < 400; i++) {
    const job = getJob(jobId);
    if (['complete', 'error', 'cancelled'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error('job did not finish');
}
const PLAN =
  '{"title":"Park","picks":[{"file":"m3","role":"primary","segments":[1,2]},{"file":"m1"}]}';

test('GET /director/actions serves the schemas that drive the form', async () => {
  const res = await fetch(`${base}/director/actions`);
  const { data } = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(
    data.map((a) => a.id),
    [
      'base_edit',
      'generate_edit',
      'generate_script',
      'execute_script',
      'insert_broll',
      'motion_piece',
      'site_demo',
      'score',
      'remove_silence',
      'beat_sync',
      'add_captions',
    ],
  );
  const duration = data[0].fields.find((f) => f.key === 'duration');
  assert.deepEqual([duration.type, duration.default, duration.unit], ['range', 60, 's']);
  assert.ok(data.every((a) => a.title && a.description && Array.isArray(a.modes)));
});

test('POST /director runs base_edit as a job with progress and a DirectorResult', async () => {
  useLlm('none');
  const { status, body } = await post(
    '/director',
    request({ action: 'base_edit', params: { duration: 20 } }),
  );
  assert.equal(status, 202);
  const job = await finished(body.jobId);
  assert.deepEqual(
    [job.status, job.type, job.projectId, job.label],
    ['complete', 'director', park.projectId, 'Base edit'],
  );
  assert.deepEqual(checkResult(job.result, { fps: 30, roots: [park.dir] }), []);
  assert.equal(job.result.mode, 'replace');
  assert.ok(job.result.notes.length >= 3 && job.result.plan.picks.length >= 2);
  // The wire summary carries the small scalar fields of the result.
  const summary = summarize(job);
  assert.equal(summary.result.summary, job.result.summary);
  assert.equal(summary.params, undefined);
  // Progress was broadcast while it ran.
  const mine = updates.filter((u) => u.id === body.jobId);
  assert.deepEqual(
    [mine[0].status, mine.at(-1).status, mine.at(-1).progress],
    ['queued', 'complete', 100],
  );
  assert.ok(
    job.log.some((l) => /8 media files \(7 analysed\) — Base edit/.test(l)),
    job.log.join(' | '),
  );
  assert.ok(job.log.some((l) => /Planned a talking-head cut of 3 picks/.test(l)));
  assert.match(job.log.at(-1), /^Base edit \(talking head\)/);
});

test('bad requests are refused before any job starts', async () => {
  const cases = [
    [{}, 400, /directive required/],
    [request({ action: 'explode' }), 400, /Unknown action "explode"/],
    [{ directive: { action: 'base_edit' } }, 400, /projectId required/],
    [{ ...request({ action: 'base_edit' }), projectId: 'nope' }, 404, /Project not found/],
    [{ ...request({ action: 'base_edit' }), adaptationId: 'nope' }, 404, /Adaptation not found/],
    [
      request({ action: 'base_edit', mode: 'sideways', params: { duration: 'x' } }),
      422,
      /Invalid directive/,
    ],
    [request({ action: 'remove_silence' }), 422, /works on the timeline/],
    [
      request({ action: 'insert_broll', params: { placement: 'overlay' } }),
      422,
      /works on the timeline/,
    ],
    [
      request(
        { action: 'beat_sync' },
        {
          edl: {
            tracks: [{ type: 'video', clips: [{ clipId: 'a', timelineStart: 2, timelineEnd: 1 }] }],
          },
        },
      ),
      422,
      /Invalid edl/,
    ],
    [request({ action: 'execute_script' }), 422, /No script to execute/],
    [
      request({ action: 'execute_script', params: { scriptPath: '/etc/hostname' } }),
      403,
      /outside the allowed/,
    ],
  ];
  const before = updates.length;
  for (const [body, status, error] of cases) {
    const res = await post('/director', body);
    assert.equal(res.status, status, JSON.stringify(res.body));
    assert.match(res.body.error, error);
  }
  const fields = (await post('/director', cases[5][0])).body.fields;
  assert.deepEqual(Object.keys(fields).sort(), ['mode', 'params.duration']);
  assert.match(
    (await post('/director', cases[8][0])).body.fields.edl,
    /tracks\[0\]\.clips\[0\] must have timelineEnd > timelineStart/,
  );
  assert.equal(updates.length, before, 'no job was created');
});

test('LLM actions answer 503 when the provider is off or unreachable; others still run', async () => {
  useLlm('none');
  const off = await post('/director', request({ action: 'generate_edit', prompt: 'x' }));
  assert.equal(off.status, 503);
  assert.deepEqual(off.body, {
    error: 'No LLM provider is configured',
    detail: 'No LLM provider is configured (LLM_PROVIDER=none)',
  });
  useLlm('dead');
  const dead = await post('/director/script', request({ action: 'generate_script' }));
  assert.equal(dead.status, 503);
  assert.match(dead.body.error, /The ollama LLM \(test-model\) is not reachable/);
  assert.match(dead.body.detail, /Cannot reach the ollama LLM server at http:\/\/127\.0\.0\.1:9/);
  // Deterministic actions do not care.
  const [video, audio] = pair(park.paths['interview.mp4'], 0, 16, 0);
  const edl = doc({ video: [[video]], audio: [[audio]] });
  for (const action of ['base_edit', 'remove_silence', 'add_captions', 'insert_broll']) {
    const res = await post('/director', request({ action }, { edl }));
    assert.equal(res.status, 202, action);
    assert.equal((await finished(res.body.jobId)).status, 'complete', action);
  }
  // insert_broll asked to use the LLM falls back instead of failing.
  const broll = await post(
    '/director',
    request({ action: 'insert_broll', prompt: 'beach', params: { useLlm: true } }, { edl }),
  );
  const job = await finished(broll.body.jobId);
  assert.equal(job.status, 'complete');
  assert.match(job.result.notes.join(' '), /keyword matching was used instead/);
});

test('generate_edit over HTTP against the fake LLM', async () => {
  useLlm('fake');
  fake.setReply(() => `<think>hmm</think>\n\`\`\`json\n${PLAN}\n\`\`\`\nEnjoy!`);
  const directive = {
    action: 'generate_edit',
    prompt: 'park film',
    mode: 'insert',
    context: { playheadPosition: 3 },
  };
  const { status, body } = await post('/director', request(directive));
  assert.equal(status, 202);
  const job = await finished(body.jobId);
  assert.equal(job.status, 'complete', job.error);
  assert.equal(job.label, 'Generate edit: park film');
  assert.deepEqual(checkResult(job.result, { fps: 30, roots: [park.dir] }), []);
  assert.deepEqual([job.result.mode, job.result.at, job.result.plan.title], ['insert', 3, 'Park']);
  assert.ok(job.log.some((l) => /Asking test-model for an edit plan/.test(l)));
});

test('POST /director/script writes script files; other actions belong on /director', async () => {
  useLlm('fake');
  fake.setReply(
    () =>
      '# Edit script: Park\n\n## Sequence\n\n### 1. Arrival\n- Source: m3 "interview.mp4", segments 1-2\n',
  );
  const wrong = await post('/director/script', request({ action: 'base_edit' }));
  assert.equal(wrong.status, 400);
  const { status, body } = await post('/director/script', request({ params: { variants: 2 } }));
  assert.equal(status, 202);
  const job = await finished(body.jobId);
  assert.deepEqual([job.status, job.type, job.result.count], ['complete', 'script', 2]);
  assert.deepEqual(Object.keys(job.result.scripts[0]), [
    'variant',
    'filename',
    'filePath',
    'script',
  ]);
  assert.ok(
    job.result.scripts.every((s) => existsSync(s.filePath) && s.filePath.startsWith(park.dir)),
  );
  assert.match(summarize(job).result.summary, /2 script options saved/);
  // The saved script can be executed by path.
  fake.setReply(() => PLAN);
  const run = await post(
    '/director',
    request({ action: 'execute_script', params: { scriptPath: job.result.scripts[0].filePath } }),
  );
  assert.equal((await finished(run.body.jobId)).status, 'complete');
});

test('a failing LLM run ends as a job error with a readable message', async () => {
  useLlm('fake');
  fake.setReply(() => 'no json at all');
  const { body } = await post('/director', request({ action: 'generate_edit' }));
  const job = await finished(body.jobId);
  assert.equal(job.status, 'error');
  assert.match(job.error, /did not return a usable edit plan/);
});

test('cancelling a job aborts the LLM request', async () => {
  useLlm('fake');
  fake.setReply(() => ({ content: 'thinking…', stall: true }));
  const { body } = await post('/director', request({ action: 'generate_edit' }));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(getJob(body.jobId).status, 'running');
  assert.equal(cancelJob(body.jobId), true);
  const job = await finished(body.jobId);
  assert.equal(job.status, 'cancelled');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual([getJob(body.jobId).status, getJob(body.jobId).result], ['cancelled', null]);
});

test('the retired legacy routes are gone', async () => {
  for (const path of ['/assemble', '/silence/remove', '/silence/analyze'])
    assert.equal((await fetch(`${base}${path}`, { method: 'POST' })).status, 404);
});
