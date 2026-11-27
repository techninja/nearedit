/**
 * A local stand-in for an LLM server, for tests. Speaks Ollama's NDJSON
 * chat stream (`/api/chat`, `/api/tags`) and the OpenAI-compatible SSE
 * stream (`/v1/chat/completions`, `/v1/models`).
 * @module api/director/testing/fakeLlm
 */

import { createServer } from 'node:http';

/**
 * @typedef {Object} FakeReply
 * @property {string} [content] - Assistant text, streamed in small pieces
 * @property {string} [reasoning] - Sent first on the provider's separate reasoning channel
 * @property {number} [status] - Answer with this HTTP status instead
 * @property {any} [body] - JSON body for `status`
 * @property {boolean} [hang] - Accept the request and never answer
 * @property {boolean} [stall] - Send the first piece, then go silent
 * @property {string} [streamError] - Emit an in-stream error after the first piece
 * @property {boolean} [plain] - Ignore `stream` and answer with one JSON body
 * @typedef {{ path: string, headers: any, body: any, n: number }} FakeRequest
 * @typedef {Object} FakeLlm
 * @property {string} url
 * @property {FakeRequest[]} requests - Every chat request received
 * @property {(fn: (req: FakeRequest) => FakeReply|string) => void} setReply
 * @property {() => Promise<void>} close
 */

/**
 * Cut text into pieces of about `size` characters.
 * @param {string} text
 * @param {number} size
 * @returns {string[]}
 */
function pieces(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

/**
 * Serialise one streamed piece in the wire format of the endpoint.
 * @param {boolean} ollama
 * @param {string} piece
 * @returns {string}
 */
function frame(ollama, piece) {
  if (ollama)
    return `${JSON.stringify({ message: { role: 'assistant', content: piece }, done: false })}\n`;
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: piece } }] })}\n\n`;
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {boolean} ollama
 * @param {FakeReply} reply
 * @param {number} pieceSize
 */
async function sendChat(res, ollama, reply, pieceSize) {
  const content = reply.content ?? '';
  if (reply.plain) {
    const message = { role: 'assistant', content };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ollama ? { message, done: true } : { choices: [{ message }] }));
    return;
  }
  res.writeHead(200, { 'Content-Type': ollama ? 'application/x-ndjson' : 'text/event-stream' });
  if (reply.reasoning) {
    const thought = ollama
      ? { message: { role: 'assistant', content: '', thinking: reply.reasoning }, done: false }
      : { choices: [{ index: 0, delta: { reasoning_content: reply.reasoning } }] };
    res.write(ollama ? `${JSON.stringify(thought)}\n` : `data: ${JSON.stringify(thought)}\n\n`);
  }
  const parts = pieces(content, pieceSize);
  for (let i = 0; i < parts.length; i++) {
    res.write(frame(ollama, parts[i]));
    await new Promise((r) => setImmediate(r));
    if (i === 0 && reply.stall) return;
    if (i === 0 && reply.streamError) {
      const error = ollama
        ? { error: reply.streamError }
        : { error: { message: reply.streamError } };
      res.end(ollama ? `${JSON.stringify(error)}\n` : `data: ${JSON.stringify(error)}\n\n`);
      return;
    }
  }
  res.end(
    ollama ? `${JSON.stringify({ done: true, eval_count: parts.length })}\n` : 'data: [DONE]\n\n',
  );
}

/**
 * Start the fake server on a free port.
 * @param {{ reply?: (req: FakeRequest) => FakeReply|string, models?: string[],
 *   apiKey?: string, pieceSize?: number }} [opts]
 * @returns {Promise<FakeLlm>}
 */
export async function startFakeLlm(opts = {}) {
  const { models = ['test-model'], apiKey = '', pieceSize = 7 } = opts;
  let replyFn = opts.reply || (() => ({ content: 'ok' }));
  /** @type {FakeRequest[]} */
  const requests = [];
  const open = new Set();

  const server = createServer(async (req, res) => {
    open.add(res);
    res.on('close', () => open.delete(res));
    const path = (req.url || '').split('?')[0];
    const json = (/** @type {number} */ status, /** @type {any} */ body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (apiKey && path.startsWith('/v1') && req.headers.authorization !== `Bearer ${apiKey}`)
      return json(401, { error: { message: 'bad api key' } });
    if (path === '/api/tags') return json(200, { models: models.map((name) => ({ name })) });
    if (path === '/v1/models') return json(200, { data: models.map((id) => ({ id })) });
    if (path !== '/api/chat' && path !== '/v1/chat/completions')
      return json(404, { error: 'not found' });

    let raw = '';
    for await (const chunk of req) raw += chunk;
    const request = { path, headers: req.headers, body: JSON.parse(raw), n: requests.length + 1 };
    requests.push(request);
    const answer = replyFn(request);
    /** @type {FakeReply} */
    const reply = typeof answer === 'string' ? { content: answer } : answer;
    if (reply.hang) return;
    if (reply.status) return json(reply.status, reply.body ?? { error: 'failed' });
    await sendChat(res, path === '/api/chat', reply, pieceSize);
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    setReply(fn) {
      replyFn = fn;
    },
    close() {
      for (const res of open) res.destroy();
      return new Promise((r) => server.close(() => r()));
    },
  };
}
