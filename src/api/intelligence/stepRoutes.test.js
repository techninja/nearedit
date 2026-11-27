/**
 * Single-step routes backed by FFmpeg only (beats, scenes, silence) over
 * real HTTP: job results, skip rules and options.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readSidecar } from '../lib/sidecar.js';
import { startTestApp } from './testing/app.js';
import { drumPattern } from './testing/signals.js';
import { writeWav } from './testing/wav.js';
import { makeCutsVideo, makeToneSilenceTone } from './testing/media.js';

/** @type {import('./testing/app.js').TestApp} */
let app;
const file = (name) => join(app.project, name);

before(async () => {
  app = await startTestApp();
  await makeCutsVideo(file('cuts.mp4'));
  await makeToneSilenceTone(file('tones.wav'));
  writeWav(file('drums.wav'), drumPattern(128, 16).samples);
});
after(() => app.close());

test('single-step jobs: result summaries, skip rules, options that force a re-run', async () => {
  const run = async (route, body) => app.waitForJob((await app.post(route, body)).body.jobId);
  const started = await app.post('/intelligence/beats', {
    filePath: file('drums.wav'),
    projectId: 'p1',
    force: true,
  });
  assert.equal(started.status, 202);
  const beats = await app.waitForJob(started.body.jobId);
  assert.deepEqual(
    [beats.type, beats.status, beats.projectId, beats.label],
    ['beats', 'complete', 'p1', 'Beats: drums.wav'],
  );
  assert.deepEqual(
    [beats.result.path, beats.result.step, beats.result.outcome],
    [file('drums.wav'), 'beats', 'ok'],
  );
  assert.ok(
    Math.abs(beats.result.bpm - 128) < 1.5 && beats.result.beats > 28,
    JSON.stringify(beats.result),
  );
  const again = await run('/intelligence/beats', { filePath: file('drums.wav') });
  assert.deepEqual(again.result, { path: file('drums.wav'), step: 'beats', outcome: 'skipped' });

  const loose = await run('/intelligence/scenes', { filePath: file('cuts.mp4') });
  assert.deepEqual([loose.result.outcome, loose.result.scenes], ['ok', 4]);
  const strict = await run('/intelligence/scenes', { filePath: file('cuts.mp4'), threshold: 0.95 });
  assert.deepEqual(
    [strict.type, strict.result.outcome, strict.result.scenes],
    ['scenes', 'ok', 2],
    'a new threshold is not "already done"',
  );
  assert.equal(readSidecar(file('cuts.mp4')).sceneThreshold, 0.95);
  assert.equal(
    (await run('/intelligence/scenes', { filePath: file('cuts.mp4'), threshold: 0.95 })).result
      .outcome,
    'skipped',
  );

  const silence = await run('/intelligence/silence', {
    filePath: file('tones.wav'),
    noiseDb: -40,
    minDuration: 1,
  });
  assert.deepEqual(
    [silence.type, silence.result.outcome, silence.result.silences],
    ['silence', 'ok', 1],
  );
  const sidecar = readSidecar(file('tones.wav'));
  assert.deepEqual([sidecar.silenceNoiseDb, sidecar.silenceMinDuration], [-40, 1]);

  assert.equal(sidecar.type, 'audio', 'a never-indexed file is probed on the way');
  assert.equal(sidecar.duration, 6);
});
