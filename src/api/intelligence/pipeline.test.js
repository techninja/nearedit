/**
 * The per-file pipeline: real FFmpeg steps plus a faked faster-whisper
 * process, checking idempotency, force, staleness, isolation of failures,
 * cancellation and progress.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeFile } from './pipeline.js';
import { STEPS, STEP_NAMES, getStep, orderSteps } from './steps/index.js';
import { readSidecar, updateSidecar } from '../lib/sidecar.js';
import { run } from '../lib/ffmpeg.js';
import { defaultDeps } from './steps/types.js';
import { settingsWith } from './testing/fakes.js';
import { FASTER_WHISPER_STDOUT } from './testing/fixtures.js';
import { ffmpeg, makeCutsVideo, tempDir } from './testing/media.js';

let dir;
let cleanup;
let video;
let pythonCalls;
before(async () => {
  ({ dir, cleanup } = tempDir('nearedit-pipeline-test-'));
  video = await makeCutsVideo(join(dir, 'clip.mp4'), { withAudio: true });
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x240:d=1',
    '-frames:v',
    '1',
    join(dir, 'pic.png'),
  ]);
});
after(() => cleanup());

/** Real FFmpeg; a scripted "python3" standing in for the faster-whisper worker. */
function makeDeps(python = () => ({ stdout: FASTER_WHISPER_STDOUT, stderr: '' })) {
  pythonCalls = [];
  return {
    ...defaultDeps,
    run: async (cmd, args, opts) => {
      if (cmd !== 'python3') return run(cmd, args, opts);
      pythonCalls.push(args);
      return args[0] === '-c' ? { stdout: '1.2.1\n', stderr: '' } : python(args, opts);
    },
  };
}
const settings = () =>
  settingsWith({
    transcription: { provider: 'faster-whisper', python: 'python3', model: 'tiny', language: '' },
    vision: { provider: 'none' },
  });

test('step registry: execution order and lookups', () => {
  assert.deepEqual(STEP_NAMES, ['probe', 'silence', 'scenes', 'beats', 'transcribe', 'tags']);
  assert.deepEqual(
    orderSteps(['tags', 'probe', 'tags', 'beats']).map((s) => s.name),
    ['probe', 'beats', 'tags'],
  );
  assert.equal(getStep('tags').jobType, 'tag');
  assert.equal(getStep('probe').jobType, 'index');
  assert.equal(getStep('nope'), undefined);
});

test('first run does the work, second run skips, force re-runs, a changed file re-runs', async () => {
  const opts = () => ({ settings: settings(), deps: makeDeps(), cache: new Map() });
  const first = await analyzeFile(video, STEPS, opts());
  assert.deepEqual(first.outcomes, {
    probe: 'ok',
    silence: 'ok',
    scenes: 'ok',
    beats: 'ok',
    transcribe: 'ok',
    tags: 'skipped: no vision provider (none: disabled (VISION_PROVIDER=none))',
  });
  assert.deepEqual(first.summaries.transcribe, {
    words: 7,
    segments: 1,
    language: 'en',
    provider: 'faster-whisper',
  });
  assert.deepEqual(first.summaries.scenes, { scenes: 4 });

  const sidecar = readSidecar(video);
  assert.equal(sidecar.transcriptProvider, 'faster-whisper');
  assert.equal(sidecar.language, 'en');
  assert.deepEqual(sidecar.transcript[0], { word: 'And', start: 0, end: 0.74, probability: 0.745 });
  assert.deepEqual(sidecar.segments[0].id, 0);
  assert.equal(sidecar.scenes.length, 4);
  assert.deepEqual(sidecar.silences, []);
  assert.deepEqual([sidecar.beats, sidecar.bpm], [[], null], 'a steady tone has no beat');
  assert.equal(sidecar._indexVersion, 2);

  const second = await analyzeFile(video, STEPS, opts());
  assert.deepEqual(Object.values(second.outcomes).slice(0, 5), Array(5).fill('skipped'));
  assert.deepEqual(second.summaries, {});
  assert.equal(pythonCalls.length, 0, 'nothing was even checked for availability');

  const forced = await analyzeFile(video, STEPS, { ...opts(), force: true });
  assert.deepEqual(Object.values(forced.outcomes).slice(0, 5), Array(5).fill('ok'));

  const later = new Date(Date.now() + 5000);
  utimesSync(video, later, later);
  assert.equal(readSidecar(video), null, 'sidecar is stale once the source changes');
  const again = await analyzeFile(video, orderSteps(['probe', 'scenes']), opts());
  assert.deepEqual(again.outcomes, { probe: 'ok', scenes: 'ok' });
  assert.equal(readSidecar(video).transcript, undefined, 'stale analysis was discarded');
});

test('default steps leave out what does not suit a file; explicit steps report it', async () => {
  const image = join(dir, 'pic.png');
  const base = { settings: settings(), deps: makeDeps() };
  const byDefault = await analyzeFile(image, STEPS, base);
  assert.deepEqual(Object.keys(byDefault.outcomes), ['probe', 'tags']);

  writeFileSync(join(dir, 'notes.txt'), 'hello');
  const text = await analyzeFile(join(dir, 'notes.txt'), STEPS, base);
  assert.deepEqual(text.outcomes, { probe: 'ok' });

  const explicit = await analyzeFile(image, orderSteps(['beats', 'scenes']), {
    ...base,
    explicit: true,
    force: true,
  });
  assert.deepEqual(explicit.outcomes, {
    scenes: 'skipped: not applicable to image files',
    beats: 'skipped: not applicable to image files',
  });
  assert.deepEqual(await analyzeFile(join(dir, 'unknown.xyz'), STEPS, base), {
    outcomes: {},
    summaries: {},
  });
});

test('a single step probes first when the file was never indexed', async () => {
  const fresh = await makeCutsVideo(join(dir, 'fresh.mp4'));
  const result = await analyzeFile(fresh, [getStep('silence')], {
    settings: settings(),
    deps: makeDeps(),
    explicit: true,
  });
  assert.deepEqual(
    result.outcomes,
    { silence: 'skipped: no audio stream' },
    'known only thanks to the probe',
  );
  const sidecar = readSidecar(fresh);
  assert.equal(sidecar.hasAudio, false);
  assert.equal(sidecar.duration, 8);
});

test('one failing step does not stop the others; per-step options reach the step', async () => {
  const deps = makeDeps(() => {
    throw new Error('python3 exited 1: CUDA out of memory');
  });
  const progress = [];
  const result = await analyzeFile(video, orderSteps(['transcribe', 'scenes', 'silence']), {
    settings: settings(),
    deps,
    force: true,
    options: { scenes: { threshold: 0.95 }, transcribe: { language: 'de' } },
    onProgress: (index, fraction) => progress.push([index, fraction]),
  });
  assert.deepEqual(result.outcomes, {
    silence: 'ok',
    scenes: 'ok',
    transcribe: 'error: python3 exited 1: CUDA out of memory',
  });
  const sidecar = readSidecar(video);
  assert.equal(sidecar.sceneThreshold, 0.95);
  assert.equal(sidecar.scenes.length, 2);
  assert.deepEqual(pythonCalls.at(-1).slice(-2), ['--language', 'de']);
  assert.ok(progress.some(([index]) => index === 0) && progress.some(([index]) => index === 1));
  assert.ok(progress.every(([, fraction]) => fraction >= 0 && fraction <= 1));

  // A stored transcript in another language is not "done" for an explicit request.
  updateSidecar(video, { transcript: [], segments: [], language: 'en' });
  const same = await analyzeFile(video, [getStep('transcribe')], {
    settings: settings(),
    deps: makeDeps(),
    options: { transcribe: { language: 'English' } },
  });
  assert.deepEqual(same.outcomes, { transcribe: 'skipped' });
  const other = await analyzeFile(video, [getStep('transcribe')], {
    settings: settings(),
    deps: makeDeps(),
    options: { transcribe: { language: 'de' } },
  });
  assert.deepEqual(other.outcomes, { transcribe: 'ok' });
});

test('an unusable provider is a skip with a reason, explained once per job', async () => {
  const logs = [];
  const cache = new Map();
  const off = settingsWith({
    transcription: {
      provider: 'auto',
      whisperCppModelPath: '',
      python: 'python-none',
      url: '',
      apiKey: '',
      sshHost: '',
    },
    vision: { provider: 'none' },
    dataDir: dir,
  });
  const opts = { settings: off, deps: defaultDeps, cache, force: true, log: (m) => logs.push(m) };
  const one = await analyzeFile(video, [getStep('transcribe')], opts);
  const two = await analyzeFile(video, [getStep('transcribe')], opts);
  assert.deepEqual(one.outcomes, {
    transcribe: 'skipped: no transcription provider (none is usable)',
  });
  assert.deepEqual(two.outcomes, one.outcomes);
  assert.equal(logs.length, 1);
  assert.match(
    logs[0],
    /^transcribe unavailable — auto: no provider is usable — whisper-cpp: .*ssh: HYDRA_HOST is not set$/,
  );
});

test('providers are resolved once per job, not once per file', async () => {
  const deps = makeDeps();
  const cache = new Map();
  const opts = { settings: settings(), deps, cache, force: true };
  await analyzeFile(video, [getStep('transcribe')], opts);
  await analyzeFile(video, [getStep('transcribe')], opts);
  assert.equal(pythonCalls.filter((args) => args[0] === '-c').length, 1);
  assert.equal(pythonCalls.length, 3);
});

test('cancellation stops the file instead of being recorded as a step error', async () => {
  const before = new AbortController();
  before.abort();
  await assert.rejects(
    analyzeFile(video, STEPS, { settings: settings(), deps: makeDeps(), signal: before.signal }),
    /cancelled/,
  );

  const during = new AbortController();
  const deps = makeDeps(
    (_args, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('python3 aborted')));
        setTimeout(() => during.abort(), 50);
      }),
  );
  const running = analyzeFile(video, orderSteps(['transcribe', 'tags']), {
    settings: settings(),
    deps,
    force: true,
    signal: during.signal,
  });
  await assert.rejects(running, /aborted/);
});
