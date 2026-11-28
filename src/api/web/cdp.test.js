import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { connect } from './cdp.js';
import { ProtocolError } from './errors.js';

/** The DevTools client against a stand-in for the browser's end of the socket. */

describe('web recorder: the DevTools client', () => {
  it('answers, times out, and fails everything at once when the browser goes', async () => {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise((resolve) => server.once('listening', resolve));
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const { id, method, params, sessionId } = JSON.parse(raw);
        if (method === 'Echo')
          socket.send(JSON.stringify({ id, result: { params, sessionId: sessionId || '' } }));
        if (method === 'Fail')
          socket.send(
            JSON.stringify({ id, error: { code: -32000, message: 'No', data: 'because' } }),
          );
        if (method === 'Emit') socket.send(JSON.stringify({ id, result: {} }));
        if (method === 'Emit')
          socket.send(
            JSON.stringify({ method: 'Page.thing', params: { n: params.n }, sessionId: params.to }),
          );
        if (method === 'Die') socket.terminate();
      });
    });
    const connection = await connect(`ws://127.0.0.1:${server.address().port}`);
    try {
      assert.deepEqual(await connection.send('Echo', { a: 1 }), {
        params: { a: 1 },
        sessionId: '',
      });
      const page = connection.session('S1');
      assert.deepEqual(await page.send('Echo'), { params: {}, sessionId: 'S1' });
      await assert.rejects(
        page.send('Fail'),
        (err) =>
          err instanceof ProtocolError &&
          err.message === 'Fail: No (because)' &&
          err.code === -32000,
      );
      await assert.rejects(
        page.send('Silent', {}, 60),
        (err) => err.timedOut && /Silent did not answer within 0.1 s/.test(err.message),
      );
      const seen = [];
      const off = page.on('Page.thing', (params) => seen.push(params.n));
      const waited = page.wait('Page.thing', { where: (params) => params.n === 3 });
      for (const [n, to] of [
        [1, 'S1'],
        [2, 'other'],
        [3, 'S1'],
      ])
        await connection.send('Emit', { n, to });
      assert.deepEqual(
        [await waited, seen],
        [{ n: 3 }, [1, 3]],
        'events reach their own session only',
      );
      off();
      await assert.rejects(
        page.wait('Page.never', { timeout: 40 }),
        /Nothing arrived \(Page\.never\) within 0 s/,
      );
      const hanging = [page.send('Silent'), page.wait('Page.never'), connection.send('Die')];
      const results = await Promise.allSettled(hanging);
      assert.deepEqual(
        results.map((result) => result.reason?.closed),
        [true, true, true],
      );
      assert.match(results[0].reason.message, /The browser closed while Silent was running/);
      assert.equal(connection.closed(), true);
      await assert.rejects(page.send('Echo'), /The browser is closed \(Echo\)/);
      await assert.rejects(page.wait('Page.thing'), /The browser closed/);
    } finally {
      connection.close();
      await new Promise((resolve) => server.close(resolve));
    }
    await assert.rejects(connect('ws://127.0.0.1:9/'), /Cannot connect to the browser/);
  });
});
