/**
 * The OpenAI-compatible transcription provider against a local HTTP server
 * that speaks the real wire format. Audio extraction uses the real FFmpeg.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createOpenAiTranscriber, remoteModel } from './openai.js';
import { openAiUrl } from '../http.js';
import { probe } from '../../lib/ffmpeg.js';
import { defaultDeps } from '../steps/types.js';
import { fakeServer, settingsWith } from '../testing/fakes.js';
import { openAiVerboseJson } from '../testing/fixtures.js';
import { ffmpeg, tempDir } from '../testing/media.js';

let dir;
let cleanup;
let audio;
before(async () => {
  ({ dir, cleanup } = tempDir('nearedit-openai-test-'));
  audio = join(dir, 'talk.wav');
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=f=300:d=10', audio]);
});
after(() => cleanup());

const provider = (transcription, tuning) =>
  createOpenAiTranscriber(settingsWith({ transcription }), defaultDeps, tuning);

test('one request: endpoint, auth, multipart fields, FLAC upload, parsed result', async () => {
  const server = await fakeServer(() => ({ body: openAiVerboseJson(['Hello', 'there', 'world']) }));
  try {
    const openai = provider({
      url: server.url,
      apiKey: 'sk-test',
      model: 'base',
      chunkSeconds: 600,
    });
    const progress = [];
    const result = await openai.transcribe(audio, {
      language: 'en',
      onProgress: (f) => progress.push(f),
    });

    assert.equal(server.requests.length, 1);
    const [request] = server.requests;
    assert.equal(`${request.method} ${request.url}`, 'POST /v1/audio/transcriptions');
    assert.equal(request.headers.authorization, 'Bearer sk-test');
    assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=/);
    const form = await request.form();
    assert.equal(form.get('model'), 'whisper-1', 'local size names map to whisper-1');
    assert.equal(form.get('response_format'), 'verbose_json');
    assert.deepEqual(form.getAll('timestamp_granularities[]'), ['word', 'segment']);
    assert.equal(form.get('language'), 'en');
    const file = /** @type {File} */ (form.get('file'));
    assert.equal(file.name, 'audio.flac');
    const bytes = Buffer.from(await file.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), 'fLaC');
    const uploaded = join(dir, 'uploaded.flac');
    writeFileSync(uploaded, bytes);
    const info = await probe(uploaded);
    assert.deepEqual([info.sampleRate, info.channels, Math.round(info.duration)], [16000, 1, 10]);

    assert.equal(result.language, 'en', '"english" → "en"');
    assert.deepEqual(result.words, [
      { word: 'Hello', start: 0, end: 0.8 },
      { word: 'there', start: 1, end: 1.8 },
      { word: 'world', start: 2, end: 2.8 },
    ]);
    assert.deepEqual(result.segments, [{ id: 0, start: 0, end: 3, text: 'Hello there world' }]);
    assert.deepEqual(progress, [1]);
  } finally {
    await server.close();
  }
});

test('long audio is split into chunks and timestamps are re-offset', async () => {
  const server = await fakeServer((_req, index) => ({
    body: openAiVerboseJson([`chunk${index}a`, `chunk${index}b`]),
  }));
  try {
    const openai = provider({
      url: `${server.url}/v1`,
      apiKey: '',
      model: 'Systran/faster-whisper-small',
      chunkSeconds: 4,
    });
    const progress = [];
    const result = await openai.transcribe(audio, {
      duration: 10,
      onProgress: (f) => progress.push(f),
    });
    assert.equal(server.requests.length, 3);
    assert.equal(server.requests[0].url, '/v1/audio/transcriptions', 'a /v1 base is not doubled');
    assert.equal(server.requests[0].headers.authorization, undefined);

    const durations = [];
    for (const [index, request] of server.requests.entries()) {
      const form = await request.form();
      assert.equal(form.get('model'), 'Systran/faster-whisper-small');
      assert.equal(form.has('language'), false);
      const path = join(dir, `chunk-${index}.flac`);
      writeFileSync(path, Buffer.from(await /** @type {File} */ (form.get('file')).arrayBuffer()));
      durations.push(Math.round((await probe(path)).duration * 10) / 10);
    }
    assert.deepEqual(durations, [4, 4, 2]);
    assert.deepEqual(
      result.words.map((w) => [w.word, w.start, w.end]),
      [
        ['chunk0a', 0, 0.8],
        ['chunk0b', 1, 1.8],
        ['chunk1a', 4, 4.8],
        ['chunk1b', 5, 5.8],
        ['chunk2a', 8, 8.8],
        ['chunk2b', 9, 9.8],
      ],
    );
    assert.deepEqual(
      result.segments.map((s) => [s.id, s.start, s.end]),
      [
        [0, 0, 2],
        [1, 4, 6],
        [2, 8, 10],
      ],
    );
    assert.deepEqual(progress, [1 / 3, 2 / 3, 1]);
  } finally {
    await server.close();
  }
});

test('rate limits are retried; other errors surface with status and body', async () => {
  const flaky = await fakeServer((_req, index) =>
    index === 0
      ? { status: 429, headers: { 'retry-after': '0' }, body: { error: { message: 'slow down' } } }
      : index === 1
        ? { status: 503, body: 'upstream busy' }
        : { body: openAiVerboseJson(['ok']) },
  );
  try {
    const result = await provider(
      { url: flaky.url, chunkSeconds: 600 },
      { retryDelay: 5 },
    ).transcribe(audio, { duration: 10 });
    assert.equal(flaky.requests.length, 3);
    assert.equal(result.words[0].word, 'ok');
  } finally {
    await flaky.close();
  }

  const broken = await fakeServer(() => ({
    status: 400,
    body: { error: { message: 'Invalid file format.' } },
  }));
  try {
    const failing = provider({ url: broken.url, chunkSeconds: 600 }).transcribe(audio, {
      duration: 10,
    });
    await assert.rejects(failing, /Transcription request failed: HTTP 400 .*Invalid file format/);
    assert.equal(broken.requests.length, 1, 'client errors are not retried');
  } finally {
    await broken.close();
  }
});

test('cancellation aborts the upload', async () => {
  let release;
  const slow = await fakeServer(() => new Promise((resolvePromise) => (release = resolvePromise)));
  try {
    const controller = new AbortController();
    const started = Date.now();
    const options = { duration: 10, signal: controller.signal };
    const running = provider({ url: slow.url, chunkSeconds: 600 }).transcribe(audio, options);
    setTimeout(() => controller.abort(), 300);
    await assert.rejects(running, /abort/i);
    assert.ok(Date.now() - started < 2500);
  } finally {
    release({});
    await slow.close();
  }
});

test('availability: unconfigured, reachable, unauthorized, refused', async () => {
  assert.deepEqual(await provider({ url: '', apiKey: '' }).available(), {
    available: false,
    detail: 'TRANSCRIBE_URL (or TRANSCRIBE_API_KEY) is not set',
  });
  const server = await fakeServer((req) =>
    req.headers.authorization === 'Bearer good'
      ? { body: { object: 'list', data: [{ id: 'whisper-1', object: 'model' }] } }
      : { status: 401, body: { error: { message: 'Incorrect API key provided' } } },
  );
  const host = new URL(server.url).host;
  try {
    const ok = await provider({ url: server.url, apiKey: 'good', model: 'base' }).available();
    assert.deepEqual(ok, { available: true, detail: `whisper-1 at ${host}` });
    assert.equal(server.requests[0].url, '/v1/models');
    const denied = await provider({ url: server.url, apiKey: 'bad' }).available();
    assert.deepEqual(denied, { available: false, detail: 'unauthorized (check the API key)' });
  } finally {
    await server.close();
  }
  // A port nothing listens on (the server above never served this client pool).
  const idle = await fakeServer(() => ({}));
  await idle.close();
  const refused = await provider({ url: idle.url, apiKey: 'good' }).available();
  assert.deepEqual(refused, { available: false, detail: 'connection refused' });
});

test('model and URL rules', () => {
  assert.equal(remoteModel({ remoteModel: '', model: 'large-v3' }), 'whisper-1');
  assert.equal(remoteModel({ remoteModel: 'whisper-large-v3', model: 'base' }), 'whisper-large-v3');
  assert.equal(
    remoteModel({ remoteModel: '', model: 'Systran/faster-whisper-base' }),
    'Systran/faster-whisper-base',
  );
  assert.equal(openAiUrl('https://api.openai.com/', '/models'), 'https://api.openai.com/v1/models');
  assert.equal(
    openAiUrl('https://api.groq.com/openai/v1', '/models'),
    'https://api.groq.com/openai/v1/models',
  );
});
