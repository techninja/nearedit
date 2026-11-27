import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import express from 'express';
import WebSocket from 'ws';
import { HttpError, apiNotFound, errorHandler } from '../../src/api/lib/httpErrors.js';
import { runJob } from '../../src/api/lib/jobRunner.js';
import { call, createSandbox } from './helpers.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER = join(ROOT, 'src', 'server.js');
let box;
let app;
let url;
let server;
let stop;

/** @returns {Promise<number>} A port nothing is listening on right now */
function freePort() {
  return new Promise((done) => {
    const probe = createServer().listen(0, () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (probe.address());
      probe.close(() => done(port));
    });
  });
}

/** Start `node src/server.js` and resolve once it logs that it is listening. */
function spawnServer(port, env = {}) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { child, output: '', exited: null };
  state.exited = new Promise((done) => child.on('exit', (code, signal) => done({ code, signal })));
  const listening = new Promise((done, fail) => {
    const collect = (chunk) => {
      state.output += chunk;
      if (state.output.includes('listening on')) done(state);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    state.exited.then(() => fail(new Error(`server exited early: ${state.output}`)));
  });
  return { state, listening };
}

before(async () => {
  box = createSandbox('server');
  const mod = await import('../../src/server.js');
  app = mod.default;
  stop = mod.stop;
  server = mod.start(0);
  await new Promise((done) => server.once('listening', done));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server?.listening) await stop(server, { graceMs: 200 });
  box?.cleanup();
});

describe('the assembled server', () => {
  it('still exports the app and start()', () => {
    assert.equal(typeof app, 'function');
    assert.equal(typeof app.use, 'function');
  });

  it('answers unknown /api routes with a JSON 404', async () => {
    for (const [method, path] of [
      ['GET', '/api/nope'],
      ['POST', '/api/projects/x/y/z'],
      ['GET', '/api/lib/config.js'],
      ['GET', '/api/events'],
      ['GET', '/api/users'],
    ]) {
      const res = await call(url, method, path, method === 'POST' ? {} : undefined);
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.match(res.headers.get('content-type'), /application\/json/);
      assert.equal(res.body.error, 'Unknown API route');
    }
  });

  it('answers malformed JSON with 400 and an oversized body with 413', async () => {
    const post = (body) =>
      fetch(`${url}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    const malformed = await post('{"name": "Park", ');
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error, 'Malformed JSON body');
    const huge = await post(JSON.stringify({ name: 'x'.repeat(11 * 1024 * 1024) }));
    assert.equal(huge.status, 413);
    assert.equal((await huge.json()).error, 'Request body too large');
  });

  it('turns an unexpected failure into a JSON 500 and keeps running', async (t) => {
    const logged = t.mock.method(console, 'error', () => {});
    // The registry cannot be written when the data "directory" is a file.
    const blocker = join(box.root, 'not-a-dir');
    writeFileSync(blocker, '');
    process.env.NEAREDIT_DATA_DIR = join(blocker, 'data');
    try {
      const body = { name: 'Park', path: box.project };
      const res = await call(url, 'POST', '/api/projects', body);
      assert.equal(res.status, 500);
      assert.equal(res.body.error, 'Internal server error');
      assert.match(res.body.detail, /ENOTDIR/);
      assert.ok(!JSON.stringify(res.body).includes('at '), 'no stack trace in the response');
      assert.match(
        String(logged.mock.calls[0].arguments[1]),
        /ENOTDIR[\s\S]*\n\s+at /,
        'stack is logged',
      );
    } finally {
      process.env.NEAREDIT_DATA_DIR = box.data;
    }
    assert.equal((await call(url, 'GET', '/api/projects')).status, 200);
  });

  it('serves the app shell for page URLs and real 404s for missing assets', async () => {
    const shell = readFileSync(join(ROOT, 'src', 'index.html'), 'utf-8');
    for (const path of ['/', '/project/abc', '/editor/abc/def']) {
      const res = await call(url, 'GET', path);
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get('content-type'), /text\/html/);
      assert.equal(res.text, shell);
    }
    assert.equal((await call(url, 'GET', '/index.html')).text, shell, 'static files are served');
    assert.equal((await call(url, 'GET', '/store/Missing.js')).status, 404);
    assert.equal((await call(url, 'POST', '/project/abc', {})).status, 404);
  });

  it('sends hardening headers and does not advertise Express', async () => {
    const res = await call(url, 'GET', '/api/projects');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('accepts WebSocket connections on /ws', async () => {
    const socket = new WebSocket(`${url.replace('http', 'ws')}/ws`);
    const first = await new Promise((done, fail) => {
      socket.once('message', (raw) => done(JSON.parse(raw.toString())));
      socket.once('error', fail);
    });
    assert.deepEqual(first, { type: 'connected' });
    socket.terminate();
  });

  it('stop() cancels running jobs, drops sockets and closes the server', async () => {
    const socket = new WebSocket(`${url.replace('http', 'ws')}/ws`);
    await new Promise((done) => socket.once('open', done));
    const closed = new Promise((done) => socket.once('close', done));
    let aborted = false;
    const job = runJob('index', {}, {}, ({ signal }) => {
      return new Promise((_, fail) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          fail(new Error('aborted'));
        });
      });
    });
    await stop(server, { graceMs: 200 });
    await closed;
    assert.equal(server.listening, false);
    assert.equal(aborted, true);
    assert.equal(job.status, 'cancelled');
  });
});

describe('error middleware on its own', () => {
  it('maps thrown errors to the documented error body', async (t) => {
    t.mock.method(console, 'error', () => {});
    const bare = express();
    bare.get('/api/teapot', () => {
      throw new HttpError(422, 'Validation failed', { fields: { name: 'name is required' } });
    });
    bare.get('/api/crash', async () => {
      throw new TypeError('boom');
    });
    bare.use('/api', apiNotFound);
    bare.use(errorHandler);
    const listening = await new Promise((done) => {
      const s = bare.listen(0, '127.0.0.1', () => done(s));
    });
    const base = `http://127.0.0.1:${listening.address().port}`;
    const invalid = await call(base, 'GET', '/api/teapot');
    assert.equal(invalid.status, 422);
    assert.deepEqual(invalid.body, {
      error: 'Validation failed',
      fields: { name: 'name is required' },
    });
    const crash = await call(base, 'GET', '/api/crash');
    assert.deepEqual([crash.status, crash.body.error], [500, 'Internal server error']);
    assert.equal((await call(base, 'GET', '/api/other')).status, 404);
    await new Promise((done) => listening.close(done));
  });
});

describe('node src/server.js', () => {
  it('starts on PORT, shuts down cleanly on SIGTERM, and reports a busy port', async () => {
    const port = await freePort();
    const env = { NEAREDIT_DATA_DIR: box.data, BROWSE_ROOTS: box.home };
    const { state } = await spawnServer(port, env).listening.then((s) => ({ state: s }));
    const res = await call(`http://127.0.0.1:${port}`, 'GET', '/api/projects');
    assert.equal(res.status, 200);

    const second = spawnServer(port, env);
    second.listening.catch(() => {}); // expected: it exits instead of listening
    const failed = await second.state.exited;
    assert.equal(failed.code, 1);
    assert.match(second.state.output, new RegExp(`Port ${port} in use`));
    assert.doesNotMatch(second.state.output, /listening on/);

    state.child.kill('SIGTERM');
    const exit = await state.exited;
    assert.deepEqual(exit, { code: 0, signal: null });
    assert.match(state.output, /SIGTERM received, shutting down/);
  });
});

describe('scripts/setup.js', () => {
  it('creates .env.local on a fresh clone and never overwrites an existing one', async () => {
    const clone = join(box.root, 'clone');
    mkdirSync(join(clone, 'scripts'), { recursive: true });
    copyFileSync(join(ROOT, 'scripts', 'setup.js'), join(clone, 'scripts', 'setup.js'));
    for (const step of ['vendor-deps.js', 'build-icons.js']) {
      const marker = JSON.stringify(join(clone, `${step}.ran`));
      const body = `import { writeFileSync } from 'node:fs';\nwriteFileSync(${marker}, '');\n`;
      writeFileSync(join(clone, 'scripts', step), body);
    }
    const run = () =>
      new Promise((done) => {
        const child = spawn(process.execPath, [join(clone, 'scripts', 'setup.js')]);
        child.on('exit', done);
      });
    assert.equal(await run(), 0);
    const envLocal = join(clone, '.env.local');
    assert.ok(existsSync(envLocal));
    assert.ok(existsSync(join(clone, 'vendor-deps.js.ran')), 'vendor step still runs');
    assert.ok(existsSync(join(clone, 'build-icons.js.ran')), 'icon step still runs');
    const lines = readFileSync(envLocal, 'utf-8').split('\n').filter(Boolean);
    assert.ok(
      lines.every((line) => line.startsWith('#')),
      'it sets no variables',
    );

    writeFileSync(envLocal, 'PORT=7000\n');
    assert.equal(await run(), 0);
    assert.equal(readFileSync(envLocal, 'utf-8'), 'PORT=7000\n');
  });
});
