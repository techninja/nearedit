/**
 * `score` through the real route, the real job runner and the server's own
 * music renderer (`src/api/music/`): what the stand-in renderer of the
 * other tests stands in for.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { getAction } from '#utils/director/actions.js';
import { applyDirectorResult } from '#utils/edl/apply.js';
import { musicClips } from '#utils/edl/musicClip.js';
import { validateEdl } from '#utils/edl/validate.js';
import { renderSong } from '#utils/music/engine/renderer.js';
import { songKey } from '#utils/music/key.js';
import { encodeWav } from '#utils/music/wav.js';
import { directorRouter } from '../../director.js';
import { cancelJob, getJob } from '../../lib/jobs.js';
import { activeMusicRenders } from '../../music/index.js';
import { HANDLERS, jobLabel, usesLlm } from '../run.js';
import { checkResult } from '../testing/invariants.js';
import { createParkProject } from '../testing/park.js';
import { clip, doc, pair } from '../testing/timeline.js';

let park;
let P;
let server;
let base;
before(async () => {
  park = await createParkProject();
  P = park.paths;
  process.env.LLM_PROVIDER = 'none';
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', directorRouter);
  await new Promise((resolve) => (server = app.listen(0, '127.0.0.1', resolve)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  park.cleanup();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const musicDir = () => join(park.dir, '.nearedit', 'music');
const rendered = () => (existsSync(musicDir()) ? readdirSync(musicDir()).sort() : []);
function timeline() {
  const [video, audio] = pair(P['interview.mp4'], 0, 16, 0);
  return doc({ video: [[video, clip(P['broll/city.mp4'], 1, 5, 16)]], audio: [[audio]] });
}
async function post(directive, extra = {}) {
  const res = await fetch(`${base}/director`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: park.projectId,
      adaptationId: park.adaptationId,
      directive: {
        ...{ action: 'score', ...directive },
        params: { style: 'auto', key: 'auto', ...directive.params },
      },
      edl: timeline(),
      ...extra,
    }),
  });
  return { status: res.status, body: await res.json() };
}
async function finished(jobId) {
  for (let i = 0; i < 1200; i++) {
    const job = getJob(jobId);
    if (['complete', 'error', 'cancelled'].includes(job.status)) return job;
    await sleep(15);
  }
  throw new Error('job did not finish');
}

test('the action is registered: served to the form and dispatched by the job', async () => {
  const { data } = await (await fetch(`${base}/director/actions`)).json();
  const served = data.find((action) => action.id === 'score');
  assert.deepEqual(served, JSON.parse(JSON.stringify(getAction('score'))));
  assert.deepEqual(
    [served.title, served.llm, served.inPlace, served.modes],
    ['Score', 'optional', true, ['replace', 'range']],
  );
  assert.deepEqual(
    served.fields.map((field) => field.key),
    ['style', 'energy', 'key', 'bpm', 'duck', 'volume', 'seed', 'useLlm'],
  );
  assert.equal(served.prompt.required, false);
  assert.ok(served.noLlmNote);
  assert.equal(typeof HANDLERS.score, 'function');
  const prepared = (params, prompt = '') =>
    /** @type {any} */ ({ action: served, directive: { prompt, params } });
  assert.equal(usesLlm(prepared({ useLlm: false })), false);
  assert.equal(usesLlm(prepared({ useLlm: true })), true);
  assert.equal(jobLabel(prepared({}, 'calm, hopeful')), 'Score: calm, hopeful');
});

test('POST /director scores the posted timeline: a rendering by the server’s own renderer', async () => {
  const { status, body } = await post({ params: { seed: 3 } });
  assert.equal(status, 202);
  const job = await finished(body.jobId);
  assert.equal(job.status, 'complete', job.error);
  assert.equal(job.type, 'director');
  const { result } = job;
  assert.deepEqual(checkResult(result, { fps: 30, roots: [park.dir] }), []);
  const out = applyDirectorResult(timeline(), result);
  assert.deepEqual(validateEdl(out).problems, []);
  const [{ clip: music, track }] = musicClips(out);
  assert.equal(track.name, 'Music');
  const { song, key } = music.music;
  assert.equal(key, songKey(song));
  assert.equal(music.sourceFile, join(musicDir(), `${key}.wav`));
  assert.deepEqual(rendered(), [`${key}.wav`], 'the rendering, and nothing else');
  // The file is the engine's own rendering of the clip's song, sample for sample.
  const wav = readFileSync(music.sourceFile);
  assert.ok(
    wav.equals(Buffer.from(encodeWav([renderSong(song)], 48000))),
    'not the engine’s samples',
  );
  assert.match(
    job.log.join('\n'),
    /\nRendering Bossa nova in Bb major, 120 BPM…\nRendering the music… \d+%/,
  );
  assert.match(job.log.at(-1), /^Score: /);

  // The same request again finds the rendering: the file is not written twice.
  const made = statSync(music.sourceFile).mtimeMs;
  const again = await finished((await post({ params: { seed: 3 } })).body.jobId);
  assert.equal(again.status, 'complete', again.error);
  assert.equal(musicClips(applyDirectorResult(timeline(), again.result))[0].clip.music.key, key);
  assert.equal(statSync(music.sourceFile).mtimeMs, made);
  assert.deepEqual(rendered(), [`${key}.wav`]);
});

test('what cannot be scored is a 422 with the field named, and no job', async () => {
  const none = await post({}, { edl: undefined });
  assert.equal(none.status, 422);
  assert.deepEqual(none.body.fields, { edl: 'Send the current timeline document as "edl"' });
  const empty = await post({}, { edl: doc({ video: [[]], audio: [[]] }) });
  assert.equal(empty.status, 422);
  assert.equal(empty.body.error, 'There is nothing on the timeline to score');
  assert.match(empty.body.fields.edl, /^Put something on the timeline first/);
  const short = await post({ mode: 'range', context: { range: { start: 3, end: 3.4 } } });
  assert.deepEqual([short.status, short.body.error], [422, 'That is too short to score']);
  const ranged = await post({ mode: 'range' });
  assert.match(ranged.body.fields['context.range'], /needs context\.range/);
  const bad = await post({ mode: 'append', params: { style: 'polka', energy: 'lots', key: 'H' } });
  assert.equal(bad.status, 422);
  assert.match(bad.body.fields.mode, /mode must be one of: replace, range/);
  assert.match(
    bad.body.fields['params.style'],
    /^Style must be one of: brand, auto, ambient, lofi/,
  );
  assert.match(bad.body.fields['params.energy'], /must be a number/);
  assert.match(bad.body.fields['params.key'], /^Key must be one of: brand, auto, C, Db/);
  for (const answer of [none, empty, short, ranged, bad])
    assert.equal(answer.body.jobId, undefined);
});

test('asking for the LLM while none is configured still gives a score, and says so', async () => {
  const { status, body } = await post({ prompt: 'calm', params: { useLlm: true, seed: 3 } });
  assert.equal(status, 202, 'an optional LLM never blocks the request');
  const job = await finished(body.jobId);
  assert.equal(job.status, 'complete', job.error);
  assert.match(job.result.notes[0], /^The LLM could not plan the music \(No LLM provider/);
  assert.deepEqual(job.result.plan.mood, ['calm']);
});

test('cancelling the job while the music renders stops the renderer and leaves no file', async () => {
  const before = rendered();
  // Ten minutes of breakbeat take the renderer long enough to be caught at work.
  const long = { mode: 'range', context: { range: { start: 0, end: 600 } } };
  const { body } = await post({ ...long, params: { style: 'breakbeat', energy: 1, seed: 5 } });
  for (
    let i = 0;
    i < 800 && !getJob(body.jobId).log.some((l) => /^Rendering the music/.test(l));
    i++
  )
    await sleep(10);
  assert.ok(activeMusicRenders() > 0, 'a render is running');
  cancelJob(body.jobId);
  assert.equal(getJob(body.jobId).status, 'cancelled');
  for (let i = 0; i < 400 && activeMusicRenders(); i++) await sleep(25);
  assert.equal(activeMusicRenders(), 0, 'the renderer has stopped');
  await sleep(50);
  assert.deepEqual(rendered(), before, 'no rendering, whole or partial');
});
