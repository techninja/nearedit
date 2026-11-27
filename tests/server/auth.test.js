import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createSandbox } from './helpers.js';

const box = createSandbox('auth');
const { start, stop } = await import('../../src/server.js');

const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
let server;
let base;
let wsBase;

/** Open a WebSocket and report whether the handshake was accepted. */
function handshake(headers = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${wsBase}/ws`, { headers });
    ws.on('open', () => {
      ws.close();
      resolve('open');
    });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
    ws.on('error', () => resolve('error'));
  });
}

before(async () => {
  server = start(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = /** @type {any} */ (server.address());
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}`;
});
after(async () => {
  delete process.env.NEAREDIT_PASSWORD;
  delete process.env.NEAREDIT_USER;
  await stop(server, { graceMs: 50 });
  box.cleanup();
});

describe('without a password', () => {
  it('serves the app, the API and the socket to anyone', async () => {
    delete process.env.NEAREDIT_PASSWORD;
    assert.equal((await fetch(`${base}/api/projects`)).status, 200);
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal(await handshake(), 'open');
  });
});

describe('with NEAREDIT_PASSWORD set', () => {
  before(() => {
    process.env.NEAREDIT_PASSWORD = 'correct horse';
    delete process.env.NEAREDIT_USER;
  });

  it('challenges every kind of request that carries no credentials', async () => {
    for (const path of [
      '/api/projects',
      '/',
      '/styles/tokens.css',
      '/api/media/file?path=/etc/passwd',
    ]) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 401, path);
      assert.match(res.headers.get('www-authenticate'), /^Basic realm="NearEdit"/);
    }
    assert.equal(await handshake(), 401);
  });

  it('refuses a wrong password, a wrong user and malformed headers', async () => {
    const attempts = [
      basic('nearedit', 'wrong'),
      basic('someone', 'correct horse'),
      basic('nearedit', ''),
      'Basic !!!',
      'Bearer correct horse',
    ];
    for (const authorization of attempts) {
      const res = await fetch(`${base}/api/projects`, { headers: { authorization } });
      assert.equal(res.status, 401, authorization);
    }
  });

  it('accepts the right credentials and hands out a session cookie', async () => {
    const authorization = basic('nearedit', 'correct horse');
    const res = await fetch(`${base}/api/projects`, { headers: { authorization } });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /^nearedit_session=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Strict$/);

    const session = cookie.split(';')[0];
    const again = await fetch(`${base}/api/projects`, { headers: { cookie: session } });
    assert.equal(again.status, 200, 'the cookie alone is enough');
    assert.equal(again.headers.get('set-cookie'), null, 'and is not issued twice');
    assert.equal(await handshake({ cookie: session }), 'open');
    assert.equal(await handshake({ authorization }), 'open');
    assert.equal(await handshake({ cookie: 'nearedit_session=deadbeef' }), 401);
  });

  it('honours a custom user name', async () => {
    process.env.NEAREDIT_USER = 'editor';
    const ok = await fetch(`${base}/api/projects`, {
      headers: { authorization: basic('editor', 'correct horse') },
    });
    const old = await fetch(`${base}/api/projects`, {
      headers: { authorization: basic('nearedit', 'correct horse') },
    });
    assert.deepEqual([ok.status, old.status], [200, 401]);
    delete process.env.NEAREDIT_USER;
  });

  it('invalidates sessions when the password changes', async () => {
    const res = await fetch(`${base}/api/projects`, {
      headers: { authorization: basic('nearedit', 'correct horse') },
    });
    const session = res.headers.get('set-cookie').split(';')[0];
    process.env.NEAREDIT_PASSWORD = 'new password';
    const stale = await fetch(`${base}/api/projects`, { headers: { cookie: session } });
    assert.equal(stale.status, 401);
    process.env.NEAREDIT_PASSWORD = 'correct horse';
  });
});
