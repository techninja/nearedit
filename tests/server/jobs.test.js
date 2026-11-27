import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import * as jobsModule from '../../src/api/jobs.js';
import { runJob } from '../../src/api/lib/jobRunner.js';
import { attachWebSocket } from '../../src/api/ws.js';
import { call, createSandbox, serve } from './helpers.js';

let box;
let api;
let wss;
const wsUrl = () => `${api.url.replace('http', 'ws')}/ws`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A job whose worker waits until the test lets it finish (or it is cancelled). */
function controllableJob(meta = {}) {
  const handle = { finish: null, aborted: false };
  handle.job = runJob('index', { secret: 'params stay on the server' }, meta, ({ signal }) => {
    return new Promise((resolve, reject) => {
      handle.finish = resolve;
      signal.addEventListener('abort', () => {
        handle.aborted = true;
        reject(new Error('aborted'));
      });
    });
  });
  return handle;
}

/** Open a client and collect everything it receives. */
async function openClient(options = {}) {
  const socket = new WebSocket(wsUrl(), options);
  const messages = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return { socket, messages };
}

before(async () => {
  box = createSandbox('jobs');
  api = await serve(jobsModule.jobsRouter);
  wss = attachWebSocket(api.server, { heartbeatMs: 60 });
});
after(async () => {
  for (const client of wss?.clients ?? []) client.terminate();
  await api?.close();
  box?.cleanup();
});

describe('jobs routes', () => {
  it('keeps re-exporting the queue functions other routers import from here', () => {
    for (const name of ['createJob', 'updateJob', 'getJob', 'subscribe', 'runJob', 'jobsRouter']) {
      assert.ok(jobsModule[name], name);
    }
  });

  it('lists jobs newest first and filters by project', async () => {
    const older = controllableJob({ projectId: 'p1', label: 'Index: older' });
    await pause(5);
    const newer = controllableJob({ projectId: 'p2', label: 'Index: newer' });
    const all = (await call(api.url, 'GET', '/api/jobs')).body;
    assert.equal(all.total, all.data.length);
    const ids = all.data.map((job) => job.id);
    assert.ok(ids.indexOf(newer.job.id) < ids.indexOf(older.job.id));
    const mine = (await call(api.url, 'GET', '/api/jobs?projectId=p1')).body;
    assert.deepEqual(
      mine.data.map((job) => job.id),
      [older.job.id],
    );
    older.finish({});
    newer.finish({});
  });

  it('summarises a job without its params and serves the result once complete', async () => {
    const handle = controllableJob({ label: 'Index: park' });
    const { id } = handle.job;
    const running = await call(api.url, 'GET', `/api/jobs/${id}`);
    assert.equal(running.status, 200);
    assert.deepEqual(
      [running.body.type, running.body.status, running.body.label, running.body.hasResult],
      ['index', 'running', 'Index: park', false],
    );
    assert.equal(running.body.params, undefined);
    const early = await call(api.url, 'GET', `/api/jobs/${id}/result`);
    assert.equal(early.status, 409);

    handle.finish({ files: [{ path: '/a.mp4' }], count: 1 });
    await pause(10);
    const done = (await call(api.url, 'GET', `/api/jobs/${id}`)).body;
    assert.deepEqual([done.status, done.progress, done.hasResult], ['complete', 100, true]);
    assert.deepEqual(done.result, { count: 1 }, 'summaries carry only small scalar fields');
    const result = await call(api.url, 'GET', `/api/jobs/${id}/result`);
    assert.deepEqual(result.body, { files: [{ path: '/a.mp4' }], count: 1 });
  });

  it('cancels a running job, aborting its worker, then drops it', async () => {
    const handle = controllableJob();
    const { id } = handle.job;
    assert.equal((await call(api.url, 'DELETE', `/api/jobs/${id}`)).status, 204);
    assert.equal(handle.aborted, true);
    assert.equal((await call(api.url, 'GET', `/api/jobs/${id}`)).body.status, 'cancelled');
    assert.equal((await call(api.url, 'GET', `/api/jobs/${id}/result`)).status, 409);
    assert.equal((await call(api.url, 'DELETE', `/api/jobs/${id}`)).status, 204);
    assert.equal((await call(api.url, 'GET', `/api/jobs/${id}`)).status, 404);
  });

  it('answers 404 for unknown jobs', async () => {
    assert.equal((await call(api.url, 'GET', '/api/jobs/nope')).status, 404);
    assert.equal((await call(api.url, 'GET', '/api/jobs/nope/result')).status, 404);
    assert.equal((await call(api.url, 'DELETE', '/api/jobs/nope')).status, 404);
  });
});

describe('WebSocket /ws', () => {
  it('greets a client and pushes every job change to it', async () => {
    const { socket, messages } = await openClient();
    await pause(20);
    assert.deepEqual(messages[0], { type: 'connected' });
    const handle = controllableJob({ label: 'Index: live' });
    handle.finish({ ok: true });
    await pause(30);
    const mine = messages.filter((m) => m.type === 'job_update' && m.job.id === handle.job.id);
    assert.deepEqual(
      mine.map((m) => m.job.status),
      ['queued', 'running', 'complete'],
    );
    assert.equal(mine[2].job.params, undefined);
    socket.close();
  });

  it('refuses pages from other origins but accepts its own and non-browser clients', async () => {
    const foreign = new WebSocket(wsUrl(), { origin: 'http://evil.example' });
    const outcome = await new Promise((resolve) => {
      foreign.once('open', () => resolve('open'));
      foreign.once('error', (err) => resolve(err.message));
    });
    assert.match(outcome, /401/);
    const own = await openClient({ origin: api.url });
    assert.equal(own.socket.readyState, WebSocket.OPEN);
    own.socket.close();
  });

  it('ignores whatever a client sends and refuses oversized frames', async () => {
    const { socket, messages } = await openClient();
    socket.send('not json');
    socket.send(JSON.stringify({ type: 'cancel', id: 'x' }));
    await pause(30);
    assert.equal(socket.readyState, WebSocket.OPEN);
    assert.equal(
      messages.filter((m) => m.type !== 'connected' && m.type !== 'job_update').length,
      0,
    );
    const closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
    socket.send('x'.repeat(64 * 1024));
    assert.equal(await closed, 1009, 'message too big');
  });

  it('drops a client that stops answering pings and keeps the live ones', async () => {
    const live = await openClient();
    // A raw TCP client completes the upgrade and then goes silent, like a laptop
    // that fell asleep: it never answers a ping.
    const { hostname, port } = new URL(api.url);
    const dead = connect(Number(port), hostname);
    const handshake = [
      'GET /ws HTTP/1.1',
      `Host: ${hostname}:${port}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version: 13',
    ];
    dead.write(`${handshake.join('\r\n')}\r\n\r\n`);
    const upgraded = await new Promise((resolve) =>
      dead.once('data', (d) => resolve(d.toString())),
    );
    assert.match(upgraded, /^HTTP\/1\.1 101/);
    assert.equal(wss.clients.size, 2);

    const droppedAt = await new Promise((resolve) => dead.once('close', () => resolve(Date.now())));
    assert.ok(droppedAt, 'the server terminated the silent socket');
    await pause(200); // several more heartbeats
    assert.equal(wss.clients.size, 1);
    assert.equal(live.socket.readyState, WebSocket.OPEN, 'a client that answers pings stays');
    live.socket.close();
  });
});
