/**
 * Local transcription providers (whisper.cpp, faster-whisper) exercised
 * through a fake process runner: command construction, output parsing,
 * availability.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWhisperCpp, findModel, whisperCppArgs } from './whisperCpp.js';
import { parseWhisperCppJson, tokensToWords } from './whisperCppParse.js';
import { WORKER_SCRIPT, createFasterWhisper, fasterWhisperArgs } from './fasterWhisper.js';
import { defaultDeps } from '../steps/types.js';
import { FASTER_WHISPER_STDOUT, WHISPER_CPP_FULL_JSON } from '../testing/fixtures.js';
import { exitError, fakeRunner, settingsWith as withSettings } from '../testing/fakes.js';
import { tempDir } from '../testing/media.js';

let dir;
let cleanup;
before(() => ({ dir, cleanup } = tempDir('nearedit-stt-test-')));
after(() => cleanup());

const settingsWith = (transcription = {}) => withSettings({ dataDir: dir, transcription });

test('whisper.cpp: tokens become words, special and non-speech tokens are dropped', () => {
  const result = parseWhisperCppJson(WHISPER_CPP_FULL_JSON);
  assert.equal(result.language, 'en');
  assert.deepEqual(
    result.segments.map((s) => [s.id, s.start, s.end, s.text]),
    [
      [0, 0, 3.36, 'And so, my fellow Americans.'],
      [1, 5, 7.5, "Ask what's 42."],
    ],
  );
  assert.deepEqual(
    result.words.map((w) => w.word),
    ['And', 'so,', 'my', 'fellow', 'Americans.', 'Ask', "what's", '42.'],
  );
  const americans = result.words[4];
  assert.deepEqual([americans.start, americans.end], [1.69, 2.36]);
  assert.equal(americans.probability, 0.913); // mean of 0.95, 0.99, 0.8
  assert.deepEqual(
    tokensToWords(
      [
        { text: ' 你', offsets: { from: 0, to: 200 }, p: 0.9 },
        { text: '好', offsets: { from: 200, to: 400 }, p: 0.8 },
      ],
      true,
    ).map((w) => w.word),
    ['你', '好'],
  );
  assert.deepEqual(parseWhisperCppJson({}), { words: [], segments: [], language: '' });
});

test('whisper.cpp: command line, progress and JSON read back from the output file', async () => {
  const model = join(dir, 'ggml-base.bin');
  writeFileSync(model, 'model');
  const settings = settingsWith({ whisperCppModelPath: model, whisperCppBin: 'whisper-cli' });
  const { deps, calls } = fakeRunner({
    ffmpeg: () => null,
    'whisper-cli': (args, opts) => {
      if (args[0] === '--help') return null;
      opts.onStderr('whisper_print_progress_callback: progress =  40%');
      opts.onStderr('whisper_print_progress_callback: progress = 100%');
      writeFileSync(`${args[args.indexOf('-of') + 1]}.json`, JSON.stringify(WHISPER_CPP_FULL_JSON));
      return null;
    },
  });
  const provider = createWhisperCpp(settings, deps);
  assert.deepEqual(await provider.available(), {
    available: true,
    detail: 'whisper-cli with ggml-base.bin',
  });

  const progress = [];
  const result = await provider.transcribe('/media/talk.mp4', {
    onProgress: (f) => progress.push(f),
  });
  assert.equal(result.words.length, 8);
  assert.deepEqual(progress, [0.4, 1]);

  const [, extract, whisper] = calls;
  assert.equal(extract.cmd, 'ffmpeg');
  const wav = extract.args.at(-1);
  assert.deepEqual(extract.args.slice(extract.args.indexOf('-i')), [
    '-i',
    '/media/talk.mp4',
    '-vn',
    '-sn',
    '-dn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    wav,
  ]);
  const outBase = whisper.args[whisper.args.indexOf('-of') + 1];
  assert.deepEqual(whisper.args, [
    '-m',
    model,
    '-f',
    wav,
    '-l',
    'auto',
    '-ojf',
    '-of',
    outBase,
    '-np',
    '-pp',
  ]);
  assert.equal(existsSync(wav), false, 'temporary directory removed');
  assert.deepEqual(
    whisperCppArgs({ model: 'm', wav: 'a.wav', outBase: 'o', language: 'de' }).slice(4, 6),
    ['-l', 'de'],
  );
});

test('whisper.cpp: availability explains what is missing; model lookup rules', async () => {
  const none = createWhisperCpp(settingsWith({ whisperCppModelPath: '' }), fakeRunner({}).deps);
  assert.match((await none.available()).detail, /no model found: set WHISPER_CPP_MODEL_PATH/);
  await assert.rejects(none.transcribe('/x.wav'), /model file not found/);

  mkdirSync(join(dir, 'models'), { recursive: true });
  writeFileSync(join(dir, 'models', 'ggml-small.bin'), 'm');
  const inData = settingsWith({ whisperCppModelPath: '', model: 'small' });
  assert.equal(findModel(inData), join(dir, 'models', 'ggml-small.bin'), 'data dir fallback');
  assert.equal(
    findModel(settingsWith({ whisperCppModelPath: join(dir, 'models'), model: 'small' })),
    join(dir, 'models', 'ggml-small.bin'),
    'directory + model name',
  );

  const missingBinary = createWhisperCpp(inData, fakeRunner({}).deps);
  assert.deepEqual(await missingBinary.available(), {
    available: false,
    detail: 'whisper-cli not found on PATH',
  });
});

test('faster-whisper: worker command line and parsed output', async () => {
  const settings = settingsWith({
    python: '/venv/bin/python3',
    model: 'small',
    device: 'cuda',
    computeType: 'float16',
  });
  const { deps, calls } = fakeRunner({
    ffmpeg: () => null,
    '/venv/bin/python3': (args, opts) => {
      if (args[0] === '-c') return { stdout: '1.2.1\n', stderr: '' };
      opts.onStderr('PROGRESS 0.5000');
      opts.onStderr('some library warning');
      return { stdout: FASTER_WHISPER_STDOUT, stderr: '' };
    },
  });
  const provider = createFasterWhisper(settings, deps);
  assert.deepEqual(await provider.available(), {
    available: true,
    detail: 'faster-whisper 1.2.1 (/venv/bin/python3)',
  });
  const progress = [];
  const result = await provider.transcribe('/media/talk.mp4', {
    language: 'en',
    onProgress: (f) => progress.push(f),
  });
  assert.equal(result.language, 'en');
  assert.deepEqual(result.words[1], { word: 'so,', start: 0.74, end: 1.08, probability: 0.883 });
  assert.deepEqual(result.segments, [
    { id: 0, start: 0, end: 10.48, text: 'And so, my fellow Americans, ask not' },
  ]);
  assert.deepEqual(progress, [0.5]);
  const worker = calls.at(-1);
  assert.deepEqual(worker.args, [
    WORKER_SCRIPT,
    worker.args[1],
    '--model',
    'small',
    '--device',
    'cuda',
    '--compute-type',
    'float16',
    '--language',
    'en',
  ]);
  assert.ok(worker.args[1].endsWith('audio.wav'));
  assert.ok(existsSync(WORKER_SCRIPT), 'the worker script ships with the repo');
  assert.equal(fasterWhisperArgs(settings.transcription, 'a.wav').includes('--language'), false);
});

test('faster-whisper: availability — missing package, missing python, and the real python3', async () => {
  const notInstalled = fakeRunner({
    python3: () => Promise.reject(exitError(3, 'python3 exited 3: ')),
  });
  const state = await createFasterWhisper(
    settingsWith({ python: 'python3' }),
    notInstalled.deps,
  ).available();
  assert.equal(state.available, false);
  assert.match(state.detail, /not installed for python3 \(pip install faster-whisper\)/);
  const noPython = await createFasterWhisper(
    settingsWith({ python: 'python9' }),
    fakeRunner({}).deps,
  ).available();
  assert.deepEqual(noPython, { available: false, detail: 'python9 not found' });
  // Real process, whatever this machine has: must answer quickly and never throw.
  const real = await createFasterWhisper(
    settingsWith({ python: 'python3' }),
    defaultDeps,
  ).available();
  assert.equal(typeof real.available, 'boolean');
  assert.ok(real.detail.length > 0);
});
