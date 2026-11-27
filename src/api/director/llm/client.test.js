import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createLlmClient } from './client.js';
import { jsonCandidates, stripReasoning } from './clean.js';
import { readLines } from './stream.js';
import { startFakeLlm } from '../testing/fakeLlm.js';

let fake;
before(async () => {
  fake = await startFakeLlm();
});
after(() => fake.close());

const cfg = (provider, extra = {}) => ({
  provider,
  url: fake.url,
  model: 'test-model',
  apiKey: '',
  ...extra,
});
const ask = (client, extra = {}) =>
  client.chat({ messages: [{ role: 'user', content: 'hi' }], ...extra });

test('ollama: streams NDJSON, reports tokens and returns the joined text', async () => {
  fake.setReply(() => 'The quick brown fox jumps over the lazy dog.');
  const deltas = [];
  const out = await ask(createLlmClient(cfg('ollama')), {
    json: true,
    temperature: 0.1,
    maxTokens: 99,
    onToken: (delta, info) => deltas.push([delta, info.chars]),
  });
  assert.equal(out.text, 'The quick brown fox jumps over the lazy dog.');
  assert.ok(deltas.length > 3);
  assert.equal(deltas.map((d) => d[0]).join(''), out.text);
  assert.equal(deltas.at(-1)[1], out.text.length);
  const sent = fake.requests.at(-1);
  assert.equal(sent.path, '/api/chat');
  assert.equal(sent.body.model, 'test-model');
  assert.equal(sent.body.format, 'json');
  assert.equal(sent.body.stream, true);
  assert.equal(sent.body.options.num_predict, 99);
  assert.deepEqual(sent.body.messages, [{ role: 'user', content: 'hi' }]);
});

test('openai: streams SSE and sends the bearer key only when configured', async () => {
  fake.setReply(() => 'Bonjour — ça va?');
  const out = await ask(createLlmClient(cfg('openai', { apiKey: 'sk-test' })), { json: true });
  assert.equal(out.text, 'Bonjour — ça va?');
  const sent = fake.requests.at(-1);
  assert.equal(sent.path, '/v1/chat/completions');
  assert.equal(sent.headers.authorization, 'Bearer sk-test');
  assert.deepEqual(sent.body.response_format, { type: 'json_object' });
  await ask(createLlmClient(cfg('openai', { url: `${fake.url}/v1/` })));
  assert.equal(fake.requests.at(-1).headers.authorization, undefined);
  assert.equal(fake.requests.at(-1).body.response_format, undefined);
});

test('reasoning blocks are stripped from text but kept in raw', async () => {
  fake.setReply(() => '<think>\nLet me plan {"x":1}\n</think>\n\n{"picks":[]}');
  for (const provider of ['ollama', 'openai']) {
    const out = await ask(createLlmClient(cfg(provider)));
    assert.equal(out.text, '{"picks":[]}');
    assert.ok(out.raw.includes('<think>'));
  }
  assert.equal(stripReasoning('reasoning…</think>answer'), 'answer');
  assert.equal(stripReasoning('answer<think>never finished'), 'answer');
  assert.equal(stripReasoning('<thinking>a</thinking>b<think>c</think>d'), 'bd');
});

test('reasoning sent on a separate channel is reported as activity, never as text', async () => {
  fake.setReply(() => ({ reasoning: 'Let me think about {"x":1}…', content: '{"picks":[]}' }));
  for (const provider of ['ollama', 'openai']) {
    const seen = [];
    const out = await ask(createLlmClient(cfg(provider)), {
      onToken: (delta, info) => seen.push([delta, info.thinking]),
    });
    assert.deepEqual([out.text, out.raw], ['{"picks":[]}', '{"picks":[]}']);
    assert.deepEqual(seen[0], ['', true]);
    assert.ok(seen.slice(1).every(([delta, thinking]) => delta && !thinking));
  }
});

test('a server that ignores stream:true is read as one complete message', async () => {
  fake.setReply(() => ({ content: 'whole body', plain: true }));
  for (const provider of ['ollama', 'openai'])
    assert.equal((await ask(createLlmClient(cfg(provider)))).text, 'whole body');
});

test('openai JSON mode falls back when the server rejects response_format', async () => {
  fake.setReply((req) =>
    req.body.response_format
      ? { status: 400, body: { error: { message: 'response_format unsupported' } } }
      : '{"ok":true}',
  );
  const before = fake.requests.length;
  const out = await ask(createLlmClient(cfg('openai')), { json: true });
  assert.equal(out.text, '{"ok":true}');
  assert.equal(fake.requests.length - before, 2);
});

test('available(): reachable server, missing model, bad key, dead port, none', async () => {
  assert.deepEqual(await createLlmClient(cfg('ollama')).available(), {
    available: true,
    detail: '',
  });
  const missing = await createLlmClient(cfg('ollama', { model: 'qwen3:14b' })).available();
  assert.equal(missing.available, false);
  assert.match(missing.detail, /qwen3:14b.*not installed/);
  assert.equal((await createLlmClient(cfg('openai')).available()).available, true);

  const keyed = await startFakeLlm({ apiKey: 'secret' });
  const bad = await createLlmClient({ ...cfg('openai'), url: keyed.url }).available();
  assert.equal(bad.available, false);
  assert.match(bad.detail, /401.*LLM_API_KEY/);
  const dead = keyed.url;
  await keyed.close();
  const gone = await createLlmClient({ ...cfg('ollama'), url: dead }).available();
  assert.equal(gone.available, false);
  assert.match(gone.detail, /Cannot reach/);

  const none = createLlmClient(cfg('none'));
  assert.equal(none.enabled, false);
  assert.match((await none.available()).detail, /LLM_PROVIDER=none/);
  assert.match((await createLlmClient(cfg('gpt')).available()).detail, /Unknown LLM_PROVIDER/);
});

test('failures carry a status: 503 unreachable/none/404, 502 bad answer', async () => {
  await assert.rejects(ask(createLlmClient(cfg('none'))), { status: 503 });
  const closed = await startFakeLlm();
  await closed.close();
  await assert.rejects(ask(createLlmClient({ ...cfg('ollama'), url: closed.url })), {
    status: 503,
    message: /Cannot reach the ollama LLM server/,
  });
  fake.setReply(() => ({ status: 404, body: { error: "model 'test-model' not found" } }));
  await assert.rejects(ask(createLlmClient(cfg('ollama'))), { status: 503, detail: /not found/ });
  fake.setReply(() => ({ status: 500, body: { error: { message: 'boom' } } }));
  await assert.rejects(ask(createLlmClient(cfg('openai'))), { status: 502, detail: 'boom' });
  fake.setReply(() => ({ content: 'partial answer', streamError: 'out of memory' }));
  for (const provider of ['ollama', 'openai'])
    await assert.rejects(ask(createLlmClient(cfg(provider))), {
      status: 502,
      message: /out of memory/,
    });
});

test('an AbortSignal cancels a request in flight', async () => {
  fake.setReply(() => ({ content: 'first piece then silence', stall: true }));
  const controller = new AbortController();
  const pending = ask(createLlmClient(cfg('ollama')), {
    signal: controller.signal,
    onToken: () => controller.abort(),
  });
  await assert.rejects(pending, { name: 'AbortError' });
  const already = new AbortController();
  already.abort();
  await assert.rejects(ask(createLlmClient(cfg('openai')), { signal: already.signal }), {
    name: 'AbortError',
  });
});

test('timeouts: a silent server and a stalled stream both give up with 504', async () => {
  fake.setReply(() => ({ hang: true }));
  await assert.rejects(ask(createLlmClient(cfg('ollama')), { timeoutMs: 80 }), {
    status: 504,
    message: /took too long/,
  });
  fake.setReply(() => ({ content: 'first piece then silence', stall: true }));
  await assert.rejects(ask(createLlmClient(cfg('openai')), { idleMs: 80 }), {
    status: 504,
    message: /stopped responding/,
  });
});

test('readLines reassembles lines split across network chunks', async () => {
  const encoder = new TextEncoder();
  const body = (async function* () {
    for (const part of ['{"a":', '1}\n{"b"', ':2}\r\n', '\n{"c":3}']) yield encoder.encode(part);
  })();
  const lines = [];
  for await (const line of readLines({ body })) lines.push(line);
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}', '', '{"c":3}']);
});

test('jsonCandidates digs JSON out of fences, prose and truncated replies', () => {
  assert.deepEqual(jsonCandidates('Sure!\n```json\n{"a":[1,2]}\n```\nHope that helps {x}'), [
    '{"a":[1,2]}',
    '{x}',
  ]);
  assert.deepEqual(jsonCandidates('Plan: {"t":"a } b","n":{"k":1}} — done.'), [
    '{"t":"a } b","n":{"k":1}}',
  ]);
  assert.deepEqual(jsonCandidates('<think>{"no":1}</think>{"picks":[{"file":"m1"'), [
    '{"picks":[{"file":"m1"',
  ]);
  assert.deepEqual(jsonCandidates('```\n[1,2]\n'), ['[1,2]']);
  assert.deepEqual(jsonCandidates('no json here'), []);
});
