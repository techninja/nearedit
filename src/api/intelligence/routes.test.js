/**
 * Index and analyze routes over real HTTP: jobs run to completion on real
 * media, are idempotent, honour paths/steps/force, can be cancelled, and
 * refuse paths outside the allowed roots.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSidecar } from '../lib/sidecar.js';
import { cancelJob, getJob } from '../lib/jobs.js';
import { startTestApp } from './testing/app.js';
import { drumPattern } from './testing/signals.js';
import { writeWav } from './testing/wav.js';
import { ffmpeg, makeCutsVideo, makeToneSilenceTone } from './testing/media.js';

/** @type {import('./testing/app.js').TestApp} */
let app;
const file = (name) => join(app.project, name);

before(async () => {
  app = await startTestApp();
  await makeCutsVideo(file('cuts.mp4'));
  await makeToneSilenceTone(file('tones.wav'));
  writeWav(file('drums.wav'), drumPattern(128, 16).samples);
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x240:d=1',
    '-frames:v',
    '1',
    file('still.png'),
  ]);
  writeFileSync(file('script.md'), '# Park day\n\nOpen on the dog.\n');
  writeFileSync(join(app.outside, 'secret.wav'), 'not yours');
});
after(() => app.close());

const stepsOf = (result, name) => result.files.find((f) => f.path === file(name)).steps;

test('POST /index probes every file into its sidecar as an "index" job', async () => {
  const { status, body } = await app.post('/index', { projectId: 'p1' });
  assert.equal(status, 202);
  const job = await app.waitForJob(body.jobId);
  assert.deepEqual(
    [job.type, job.status, job.progress, job.label],
    ['index', 'complete', 100, 'Index: 5 files'],
  );
  assert.equal(job.result.total, 5);
  assert.equal(job.result.failed, 0);
  for (const entry of job.result.files) assert.deepEqual(entry.steps, { probe: 'ok' });
  assert.equal(readSidecar(file('cuts.mp4')).duration, 8);
  assert.equal(readSidecar(file('still.png')).width, 320);
  assert.equal(readSidecar(file('script.md')).sections[0].heading, 'Park day');
  assert.equal(readSidecar(file('cuts.mp4')).scenes, undefined, 'index is probe only');
});

test('POST /intelligence/analyze runs every suitable step, then skips, then re-runs with force', async () => {
  const first = await app.post('/intelligence/analyze', { projectId: 'p1' });
  assert.equal(first.status, 202);
  const job = await app.waitForJob(first.body.jobId);
  assert.deepEqual([job.type, job.status, job.progress], ['analyze', 'complete', 100]);
  const result = job.result;
  assert.deepEqual([result.total, result.failed], [5, 0]);
  const off = 'skipped: no transcription provider (none: disabled (TRANSCRIBE_PROVIDER=none))';
  const noVision = 'skipped: no vision provider (none: disabled (VISION_PROVIDER=none))';
  assert.deepEqual(stepsOf(result, 'cuts.mp4'), { probe: 'skipped', scenes: 'ok', tags: noVision });
  assert.deepEqual(stepsOf(result, 'tones.wav'), {
    probe: 'skipped',
    silence: 'ok',
    beats: 'ok',
    transcribe: off,
  });
  assert.deepEqual(stepsOf(result, 'drums.wav'), {
    probe: 'skipped',
    silence: 'ok',
    beats: 'ok',
    transcribe: off,
  });
  assert.deepEqual(stepsOf(result, 'still.png'), { probe: 'skipped', tags: noVision });
  assert.deepEqual(stepsOf(result, 'script.md'), { probe: 'skipped' });

  const cuts = readSidecar(file('cuts.mp4'));
  assert.deepEqual(
    cuts.scenes.map((s) => s.start),
    [0, 2, 3.5, 6],
  );
  const tones = readSidecar(file('tones.wav'));
  assert.equal(tones.silences.length, 1);
  assert.ok(
    Math.abs(tones.silences[0].start - 2) < 0.02 && Math.abs(tones.silences[0].end - 4) < 0.02,
  );
  const drums = readSidecar(file('drums.wav'));
  assert.ok(Math.abs(drums.bpm - 128) < 1.5, `bpm ${drums.bpm}`);
  assert.ok(drums.beats.length > 28);

  const second = await app.waitForJob(
    (await app.post('/intelligence/analyze', { projectId: 'p1' })).body.jobId,
  );
  assert.deepEqual(stepsOf(second.result, 'drums.wav'), {
    probe: 'skipped',
    silence: 'skipped',
    beats: 'skipped',
    transcribe: off,
  });
  assert.deepEqual(stepsOf(second.result, 'cuts.mp4'), {
    probe: 'skipped',
    scenes: 'skipped',
    tags: noVision,
  });

  const updatedAt = drums._updatedAt;
  const forced = await app.waitForJob(
    (await app.post('/intelligence/analyze', { projectId: 'p1', force: true })).body.jobId,
  );
  assert.deepEqual(stepsOf(forced.result, 'drums.wav'), {
    probe: 'ok',
    silence: 'ok',
    beats: 'ok',
    transcribe: off,
  });
  assert.notEqual(readSidecar(file('drums.wav'))._updatedAt, updatedAt);
});

test('analyze honours `paths` and `steps`', async () => {
  const body = {
    projectId: 'p1',
    paths: [file('tones.wav'), file('still.png')],
    steps: ['beats', 'silence'],
    force: true,
  };
  const job = await app.waitForJob((await app.post('/intelligence/analyze', body)).body.jobId);
  assert.equal(job.label, 'Analyze: 2 files');
  assert.deepEqual(job.result.files, [
    { path: file('tones.wav'), steps: { silence: 'ok', beats: 'ok' } },
    {
      path: file('still.png'),
      steps: {
        silence: 'skipped: not applicable to image files',
        beats: 'skipped: not applicable to image files',
      },
    },
  ]);
  const noProject = await app.post('/intelligence/analyze', {
    paths: [file('tones.wav')],
    steps: ['probe'],
  });
  assert.equal(noProject.status, 202, 'paths alone are enough');
  await app.waitForJob(noProject.body.jobId);
});

test('bad requests are refused before any job starts', async () => {
  const cases = [
    ['/intelligence/analyze', { projectId: 'p1', paths: [join(app.outside, 'secret.wav')] }, 403],
    ['/intelligence/analyze', { projectId: 'p1', paths: [file('tones.wav'), '/etc/passwd'] }, 403],
    [
      '/intelligence/analyze',
      { projectId: 'p1', paths: [`${app.project}/../outside/secret.wav`] },
      403,
    ],
    ['/intelligence/analyze', { projectId: 'p1', paths: [file('gone.mp4')] }, 404],
    ['/intelligence/analyze', { projectId: 'p1', paths: [app.project] }, 400],
    ['/intelligence/analyze', { projectId: 'p1', paths: 'tones.wav' }, 400],
    ['/intelligence/analyze', { projectId: 'p1', paths: [] }, 400],
    ['/intelligence/analyze', { projectId: 'p1', steps: ['probe', 'magic'] }, 400],
    ['/intelligence/analyze', { projectId: 'p1', steps: [] }, 400],
    ['/intelligence/analyze', { projectId: 'nope' }, 404],
    ['/index', { projectId: 'nope' }, 404],
    ['/intelligence/beats', { filePath: join(app.outside, 'secret.wav') }, 403],
    ['/intelligence/beats', {}, 400],
    ['/intelligence/beats', { filePath: file('gone.wav') }, 404],
    ['/intelligence/beats', { filePath: file('still.png') }, 400],
    ['/intelligence/scenes', { filePath: file('tones.wav') }, 400],
    ['/intelligence/scenes', { filePath: file('cuts.mp4'), threshold: 7 }, 400],
    ['/intelligence/scenes', { filePath: file('cuts.mp4'), threshold: "0.3',crop=1" }, 400],
    [
      '/intelligence/silence',
      { filePath: file('tones.wav'), noiseDb: 5, minDuration: 'long' },
      400,
    ],
    ['/intelligence/transcribe', { filePath: file('tones.wav'), language: 'en; rm -rf /' }, 400],
    ['/intelligence/tag', { filePath: file('still.png'), frames: 100 }, 400],
  ];
  for (const [route, body, expected] of cases) {
    const res = await app.post(route, body);
    assert.equal(
      res.status,
      expected,
      `${route} ${JSON.stringify(body)} → ${JSON.stringify(res.body)}`,
    );
    assert.equal(typeof res.body.error, 'string');
    assert.equal(res.body.jobId, undefined);
  }
  const fields = (
    await app.post('/intelligence/silence', {
      filePath: file('tones.wav'),
      noiseDb: 5,
      minDuration: 'long',
    })
  ).body.fields;
  assert.deepEqual(Object.keys(fields), ['noiseDb', 'minDuration']);
  assert.equal(existsSync(join(app.outside, 'secret.wav.nearedit.json')), false);
});

test('a running analyze job can be cancelled: FFmpeg stops, the job stays cancelled', async () => {
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'sine=f=220:r=8000:d=3600',
    '-c:a',
    'flac',
    file('long.flac'),
  ]);
  const body = {
    projectId: 'p1',
    paths: [file('long.flac'), file('tones.wav')],
    steps: ['silence', 'beats'],
    force: true,
  };
  const { jobId } = (await app.post('/intelligence/analyze', body)).body;
  while (getJob(jobId).status === 'queued' || getJob(jobId).progress < 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  const cancelledAt = Date.now();
  assert.equal(cancelJob(jobId), true);
  assert.equal(getJob(jobId).status, 'cancelled');

  // The analysis lane is single-file: this job only runs once the cancelled one let go.
  const next = await app.post('/intelligence/silence', {
    filePath: file('tones.wav'),
    force: true,
  });
  const done = await app.waitForJob(next.body.jobId);
  assert.equal(done.status, 'complete');
  assert.ok(Date.now() - cancelledAt < 3000, 'the lane was released promptly');
  assert.equal(getJob(jobId).status, 'cancelled', 'not overwritten by a late error');
  assert.equal(getJob(jobId).result, null);
  assert.equal(
    readSidecar(file('long.flac'))?.beats,
    undefined,
    'the interrupted file got no partial result',
  );
});
