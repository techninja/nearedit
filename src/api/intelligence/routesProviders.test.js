/**
 * Status, model-backed single-step routes, transcript export and search over
 * real HTTP. Model providers are local HTTP servers speaking the real wire
 * formats.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSidecar } from '../lib/sidecar.js';
import { NO_PROVIDERS, startTestApp } from './testing/app.js';
import { fakeServer } from './testing/fakes.js';
import { openAiVerboseJson } from './testing/fixtures.js';
import { drumPattern } from './testing/signals.js';
import { writeWav } from './testing/wav.js';
import { makeCutsVideo, makeToneSilenceTone } from './testing/media.js';

/** @type {import('./testing/app.js').TestApp} */
let app;
const file = (name) => join(app.project, name);
const query = (name) => encodeURIComponent(file(name));

before(async () => {
  app = await startTestApp();
  await makeCutsVideo(file('park-walk.mp4'), { withAudio: true });
  await makeToneSilenceTone(file('tones.wav'));
  writeWav(file('drums.wav'), drumPattern(120, 8).samples);
  writeFileSync(file('script.md'), '# Park day\n\nOpen on the dog by the lake.\n');
});
after(() => app.close());

/** Set environment variables for one test and restore the no-provider baseline after. */
async function withEnv(vars, work) {
  Object.assign(process.env, vars);
  try {
    return await work();
  } finally {
    for (const key of Object.keys(vars)) delete process.env[key];
    Object.assign(process.env, NO_PROVIDERS);
  }
}

test('GET /intelligence/status answers fast when nothing is installed', async () => {
  const closed = await fakeServer(() => ({}));
  await closed.close();
  const dead = closed.url; // a port nothing listens on
  const env = {
    TRANSCRIBE_PROVIDER: 'auto',
    WHISPER_CPP_BIN: 'nearedit-no-such-binary',
    FASTER_WHISPER_PYTHON: 'nearedit-no-such-python',
    VISION_PROVIDER: 'ollama',
    LLM_PROVIDER: 'ollama',
    OLLAMA_URL: dead,
  };
  await withEnv(env, async () => {
    const started = Date.now();
    const { status, body } = await app.get('/intelligence/status');
    const elapsed = Date.now() - started;
    assert.equal(status, 200);
    assert.ok(elapsed < 1500, `took ${elapsed} ms`);
    assert.equal(body.ffmpeg.available, true);
    assert.match(body.ffmpeg.detail, /^\d+\.\d+/);
    assert.deepEqual(
      [body.transcription.provider, body.transcription.configured, body.transcription.available],
      ['auto', 'auto', false],
    );
    assert.match(
      body.transcription.detail,
      /whisper-cpp: .*faster-whisper: nearedit-no-such-python not found; openai: .*ssh: /,
    );
    assert.deepEqual(body.vision, {
      provider: 'ollama',
      model: 'llava:7b',
      available: false,
      detail: 'connection refused',
    });
    assert.deepEqual(body.llm, {
      provider: 'ollama',
      model: 'qwen3:14b',
      available: false,
      detail: 'connection refused',
    });

    const transcribe = await app.post('/intelligence/transcribe', { filePath: file('tones.wav') });
    assert.equal(transcribe.status, 503);
    assert.equal(transcribe.body.error, 'No provider available for transcribe');
    assert.match(transcribe.body.detail, /no provider is usable/);
    const tag = await app.post('/intelligence/tag', { filePath: file('park-walk.mp4') });
    assert.deepEqual([tag.status, tag.body.detail], [503, 'ollama: connection refused']);
  });
  const disabled = (await app.get('/intelligence/status')).body;
  assert.deepEqual(disabled.transcription.detail, 'disabled (TRANSCRIBE_PROVIDER=none)');
  assert.deepEqual(disabled.llm, {
    provider: 'none',
    model: 'qwen3:14b',
    available: false,
    detail: 'disabled (LLM_PROVIDER=none)',
  });
});

test('transcribe → sidecar → export, through an OpenAI-compatible server', async () => {
  const stt = await fakeServer((req) =>
    req.url.endsWith('/models')
      ? { body: { data: [] } }
      : { body: openAiVerboseJson(['Walking', 'the', 'dog', 'today']) },
  );
  try {
    await withEnv(
      {
        TRANSCRIBE_PROVIDER: 'openai',
        TRANSCRIBE_URL: stt.url,
        TRANSCRIBE_MODEL: 'whisper-large-v3',
      },
      async () => {
        const status = (await app.get('/intelligence/status')).body.transcription;
        assert.deepEqual(status, {
          provider: 'openai',
          configured: 'openai',
          model: 'base',
          available: true,
          detail: `whisper-large-v3 at ${new URL(stt.url).host}`,
        });

        const started = await app.post('/intelligence/transcribe', {
          filePath: file('park-walk.mp4'),
          language: 'English',
        });
        assert.equal(started.status, 202);
        const job = await app.waitForJob(started.body.jobId);
        assert.deepEqual(
          [job.type, job.status, job.label],
          ['transcribe', 'complete', 'Transcribe: park-walk.mp4'],
        );
        assert.deepEqual(job.result, {
          path: file('park-walk.mp4'),
          step: 'transcribe',
          outcome: 'ok',
          words: 4,
          segments: 1,
          language: 'en',
          provider: 'openai',
        });
        const upload = await stt.requests.find((r) => r.method === 'POST').form();
        assert.deepEqual([upload.get('model'), upload.get('language')], ['whisper-large-v3', 'en']);
      },
    );
  } finally {
    await stt.close();
  }
  const sidecar = readSidecar(file('park-walk.mp4'));
  assert.equal(sidecar.transcriptProvider, 'openai');
  assert.deepEqual(sidecar.transcript[2], { word: 'dog', start: 2, end: 2.8 });

  const srt = await app.get(`/intelligence/transcript?path=${query('park-walk.mp4')}&format=srt`);
  assert.equal(srt.status, 200);
  assert.match(srt.headers.get('content-type'), /^application\/x-subrip/);
  assert.equal(srt.text, '1\n00:00:00,000 --> 00:00:04,000\nWalking the dog today\n');
  const vtt = await app.get(
    `/intelligence/transcript?path=${query('park-walk.mp4')}&format=vtt&download=1`,
  );
  assert.match(vtt.headers.get('content-type'), /^text\/vtt/);
  assert.match(vtt.headers.get('content-disposition'), /attachment; filename="park-walk.mp4.vtt"/);
  assert.ok(vtt.text.startsWith('WEBVTT\n\n00:00:00.000 --> 00:00:04.000\n'));
  assert.equal(
    (await app.get(`/intelligence/transcript?path=${query('park-walk.mp4')}&format=txt`)).text,
    'Walking the dog today\n',
  );
  const json = (await app.get(`/intelligence/transcript?path=${query('park-walk.mp4')}`)).body;
  assert.deepEqual(
    [json.language, json.provider, json.words.length, json.text],
    ['en', 'openai', 4, 'Walking the dog today'],
  );

  assert.equal(
    (await app.get(`/intelligence/transcript?path=${query('park-walk.mp4')}&format=docx`)).status,
    400,
  );
  assert.equal(
    (await app.get(`/intelligence/transcript?path=${query('tones.wav')}&format=srt`)).status,
    404,
  );
  assert.equal(
    (await app.get(`/intelligence/transcript?path=${encodeURIComponent('/etc/hostname')}`)).status,
    403,
  );
  assert.equal((await app.get('/intelligence/transcript')).status, 400);
});

test('tag → sidecar, through an Ollama server', async () => {
  let frames = 0;
  const ollama = await fakeServer((req) => {
    if (req.url === '/api/tags')
      return { body: { models: [{ name: 'llava:7b', model: 'llava:7b' }] } };
    const content = JSON.stringify({
      description: `Shot ${++frames} of a lakeside path.`,
      tags: ['lake', `shot ${frames}`],
    });
    return { body: { model: 'llava:7b', message: { role: 'assistant', content }, done: true } };
  });
  try {
    await withEnv({ VISION_PROVIDER: 'ollama', VISION_URL: ollama.url }, async () => {
      const started = await app.post('/intelligence/tag', {
        filePath: file('park-walk.mp4'),
        frames: 3,
        force: true,
      });
      assert.equal(started.status, 202);
      const job = await app.waitForJob(started.body.jobId);
      assert.deepEqual(
        [job.type, job.status, job.result.outcome, job.result.keyframes],
        ['tag', 'complete', 'ok', 3],
      );
    });
  } finally {
    await ollama.close();
  }
  const sidecar = readSidecar(file('park-walk.mp4'));
  assert.deepEqual(sidecar.tags, ['lake', 'shot 1', 'shot 2', 'shot 3']);
  assert.equal(sidecar.keyframes.length, 3);
  assert.equal(
    sidecar.description,
    'Shot 1 of a lakeside path. Shot 2 of a lakeside path. Shot 3 of a lakeside path.',
  );
  assert.equal(sidecar.transcript.length, 4, 'earlier analysis is kept');
});

test('GET /index/search finds filenames, tags, transcripts and script text', async () => {
  await app.waitForJob((await app.post('/index', { projectId: 'p1' })).body.jobId);
  const dog = (await app.get('/index/search?q=dog&projectId=p1')).body;
  assert.deepEqual(dog.data.map((r) => r.filename).sort(), ['park-walk.mp4', 'script.md']);
  const video = dog.data.find((r) => r.filename === 'park-walk.mp4');
  assert.deepEqual(video.matches, [
    { field: 'transcript', text: 'Walking the dog today', start: 0, end: 4, time: 2 },
  ]);
  assert.deepEqual([video.type, video.duration, video.relativePath], ['video', 8, 'park-walk.mp4']);
  assert.equal(video.transcript, undefined, 'results carry match info, not the sidecar');
  assert.ok(JSON.stringify(dog).length < 2000);

  const lake = (await app.get('/index/search?q=LAKE%20walk&projectId=p1')).body;
  assert.deepEqual(
    lake.data.map((r) => r.filename),
    ['park-walk.mp4'],
  );
  assert.deepEqual(lake.data[0].matches.map((m) => m.field).slice(0, 2), ['filename', 'tag']);
  assert.deepEqual(
    (await app.get('/index/search?q=drums&projectId=p1')).body.data.map((r) => r.filename),
    ['drums.wav'],
  );
  assert.equal((await app.get('/index/search?q=park&projectId=p1&limit=1')).body.data.length, 1);
  assert.equal((await app.get('/index/search?q=park&projectId=p1')).body.total, 2);
  assert.deepEqual((await app.get('/index/search?q=giraffe&projectId=p1')).body, {
    data: [],
    total: 0,
  });
  assert.deepEqual((await app.get('/index/search?projectId=p1')).body, { data: [], total: 0 });
  assert.equal((await app.get('/index/search?q=dog&projectId=missing')).status, 404);
});
