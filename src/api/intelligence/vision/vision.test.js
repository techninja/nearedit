/**
 * Vision tagging with real frame extraction and both providers against local
 * HTTP servers speaking the real wire formats. Pure parsing: reply.test.js.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAG_PROMPT } from './reply.js';
import { extractFrame } from './frames.js';
import { createOllamaVision, hasOllamaModel } from './ollama.js';
import { createOpenAiVision } from './openai.js';
import { resolveVision } from './index.js';
import { tagsStep } from '../steps/tags.js';
import { probe, run } from '../../lib/ffmpeg.js';
import { defaultDeps } from '../steps/types.js';
import { fakeServer, settingsWith } from '../testing/fakes.js';
import { CUTS_DURATION, ffmpeg, makeCutsVideo, stepContext, tempDir } from '../testing/media.js';

let dir;
let cleanup;
let video;
let still;
before(async () => {
  ({ dir, cleanup } = tempDir('nearedit-vision-test-'));
  video = await makeCutsVideo(join(dir, 'cuts.mp4'));
  still = join(dir, 'tall.png');
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=1200x1600:d=1', '-frames:v', '1', still]);
});
after(() => cleanup());

const scenes = [
  { start: 0, end: 2 },
  { start: 2, end: 3.5 },
  { start: 3.5, end: 6 },
  { start: 6, end: 8 },
];
const ollamaReply = (content) => ({
  model: 'llava:7b',
  created_at: '2026-01-01T00:00:00.000Z',
  message: { role: 'assistant', content },
  done_reason: 'stop',
  done: true,
});

test('frames are extracted as JPEGs no larger than 768 px on the long side', async () => {
  const frame = await extractFrame(run, video, 2.5);
  assert.deepEqual([frame[0], frame[1]], [0xff, 0xd8], 'JPEG magic');
  writeFileSync(join(dir, 'frame.jpg'), frame);
  const wide = await probe(join(dir, 'frame.jpg'));
  assert.deepEqual([wide.width, wide.height], [640, 360], 'small sources are not upscaled');
  writeFileSync(join(dir, 'tall.jpg'), await extractFrame(run, still, null));
  const tall = await probe(join(dir, 'tall.jpg'));
  assert.deepEqual([tall.width, tall.height], [576, 768]);
  await assert.rejects(extractFrame(run, join(dir, 'missing.mp4'), 1), /ffmpeg exited/);
});

test('ollama: /api/tags availability and the /api/chat request', async () => {
  const server = await fakeServer((req) =>
    req.url === '/api/tags'
      ? {
          body: {
            models: [
              { name: 'llava:7b', model: 'llava:7b', size: 4733363377 },
              { name: 'moondream:latest', model: 'moondream:latest' },
            ],
          },
        }
      : { body: ollamaReply('{"description": "Test bars", "tags": ["bars"]}') },
  );
  try {
    const cfg = { provider: 'ollama', url: `${server.url}/`, model: 'llava:7b', apiKey: '' };
    const ollama = createOllamaVision(cfg, defaultDeps);
    const host = new URL(server.url).host;
    assert.deepEqual(await ollama.available(), { available: true, detail: `llava:7b at ${host}` });
    assert.equal(
      (await createOllamaVision({ ...cfg, model: 'moondream' }, defaultDeps).available()).available,
      true,
    );
    const missing = await createOllamaVision(
      { ...cfg, model: 'bakllava' },
      defaultDeps,
    ).available();
    assert.deepEqual(missing, {
      available: false,
      detail: 'model "bakllava" is not pulled (ollama pull bakllava)',
    });

    const jpeg = await extractFrame(run, video, 1);
    assert.equal(await ollama.describe(jpeg), '{"description": "Test bars", "tags": ["bars"]}');
    const request = server.requests.at(-1);
    assert.equal(`${request.method} ${request.url}`, 'POST /api/chat');
    const body = request.json();
    assert.deepEqual([body.model, body.stream, body.format], ['llava:7b', false, 'json']);
    assert.deepEqual(
      body.messages.map((m) => [m.role, m.content]),
      [['user', TAG_PROMPT]],
    );
    assert.ok(
      Buffer.from(body.messages[0].images[0], 'base64').equals(jpeg),
      'raw base64, no data: prefix',
    );
  } finally {
    await server.close();
  }
  assert.equal(hasOllamaModel({ models: [] }, 'llava'), false);
  assert.equal(hasOllamaModel(null, 'llava'), false);
});

test('openai: /v1/models availability and the chat completion request', async () => {
  const completion = (content) => ({
    id: 'chatcmpl-1',
    object: 'chat.completion',
    model: 'gpt-4o-mini',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  });
  const server = await fakeServer((req, index) => {
    if (req.url === '/v1/models') return { body: { object: 'list', data: [] } };
    return {
      body: completion(
        index % 2
          ? '{"description": "A", "tags": ["a"]}'
          : [{ type: 'text', text: '{"description": "B", "tags": ["b"]}' }],
      ),
    };
  });
  try {
    const cfg = { provider: 'openai', url: server.url, model: 'gpt-4o-mini', apiKey: 'sk-vision' };
    const openai = createOpenAiVision(cfg, defaultDeps);
    assert.equal((await openai.available()).available, true);
    assert.equal(server.requests[0].headers.authorization, 'Bearer sk-vision');
    const jpeg = await extractFrame(run, video, 1);
    assert.equal(await openai.describe(jpeg), '{"description": "A", "tags": ["a"]}');
    assert.equal(
      await openai.describe(jpeg),
      '{"description": "B", "tags": ["b"]}',
      'content given as parts',
    );
    const request = server.requests[1];
    assert.equal(`${request.method} ${request.url}`, 'POST /v1/chat/completions');
    const body = request.json();
    assert.deepEqual(Object.keys(body), ['model', 'messages'], 'only universally supported fields');
    const [text, image] = body.messages[0].content;
    assert.deepEqual(text, { type: 'text', text: TAG_PROMPT });
    assert.equal(image.type, 'image_url');
    assert.equal(image.image_url.url, `data:image/jpeg;base64,${jpeg.toString('base64')}`);
  } finally {
    await server.close();
  }
});

test('tags step: frames at scene starts, aggregated; one bad frame is tolerated', async () => {
  let chats = 0;
  const replies = [
    '{"description": "A test card.", "tags": ["test card", "colour"]}',
    '{"description": "Colour bars.", "tags": ["bars", "colour"]}',
    null,
    'A fractal, described in prose only.',
  ];
  const server = await fakeServer((req) => {
    if (req.url === '/api/tags') return { body: { models: [{ name: 'llava:7b' }] } };
    const reply = replies[chats++];
    return reply
      ? { body: ollamaReply(reply) }
      : { status: 500, body: { error: 'model runner crashed' } };
  });
  try {
    const settings = settingsWith({
      vision: { provider: 'ollama', url: server.url, model: 'llava:7b' },
    });
    const logs = [];
    const fractions = [];
    const ctx = stepContext('video', {
      settings,
      sidecar: { duration: CUTS_DURATION, scenes },
      options: { frames: 4 },
      log: (m) => logs.push(m),
      progress: (f) => fractions.push(f),
    });
    assert.deepEqual(await tagsStep.available(ctx), {
      available: true,
      detail: `ollama: llava:7b at ${new URL(server.url).host}`,
    });
    const patch = await tagsStep.run(video, ctx);
    assert.deepEqual(
      patch.keyframes.map((k) => k.time),
      [0.5, 2.375, 6.5],
    );
    assert.deepEqual(patch.tags, ['colour', 'test card', 'bars']);
    assert.equal(
      patch.description,
      'A test card. Colour bars. A fractal, described in prose only.',
    );
    assert.deepEqual(patch.keyframes[2], {
      time: 6.5,
      tags: [],
      description: 'A fractal, described in prose only.',
    });
    assert.match(logs[0], /frame at 4s failed: .*HTTP 500/);
    assert.deepEqual(fractions, [0.25, 0.5, 0.75, 1]);
    assert.deepEqual(tagsStep.summary(patch), { tags: 3, keyframes: 3 });

    chats = 2; // every request now fails
    replies.length = 0;
    await assert.rejects(tagsStep.run(still, stepContext('image', { settings })), /HTTP 500/);
  } finally {
    await server.close();
  }
});

test('tags step: stills get one frame; unavailable and disabled providers are reported', async () => {
  const server = await fakeServer((req) =>
    req.url === '/api/tags'
      ? { body: { models: [{ name: 'llava:7b' }] } }
      : { body: ollamaReply('{"description": "A chart.", "tags": ["chart"]}') },
  );
  try {
    const settings = settingsWith({
      vision: { provider: 'ollama', url: server.url, model: 'llava:7b' },
    });
    const patch = await tagsStep.run(still, stepContext('image', { settings }));
    assert.deepEqual(patch, {
      tags: ['chart'],
      description: 'A chart.',
      keyframes: [{ time: 0, tags: ['chart'], description: 'A chart.' }],
    });
    assert.equal(server.requests.filter((r) => r.url === '/api/chat').length, 1);
  } finally {
    await server.close();
  }
  const off = await resolveVision(settingsWith({ vision: { provider: 'none' } }), defaultDeps);
  assert.deepEqual([off.available, off.detail], [false, 'disabled (VISION_PROVIDER=none)']);
  const unknown = await resolveVision(
    settingsWith({ vision: { provider: 'clippy' } }),
    defaultDeps,
  );
  assert.match(unknown.detail, /unknown VISION_PROVIDER "clippy"/);
  const down = stepContext('video', {
    settings: settingsWith({ vision: { provider: 'ollama', url: 'http://127.0.0.1:9' } }),
  });
  const state = await tagsStep.available(down);
  assert.equal(state.available, false);
  assert.match(state.detail, /^no vision provider \(ollama: /);
  await assert.rejects(tagsStep.run(video, down), /No vision provider/);
  assert.equal(tagsStep.unsuitable('audio', null), 'not applicable to audio files');
  assert.equal(tagsStep.unsuitable('image', null), '');
  assert.equal(tagsStep.done({ keyframes: [] }, {}), true);
  assert.equal(tagsStep.done({ tags: ['user tag'] }, {}), false);
});
