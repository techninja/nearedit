import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { allowHint, isAllowed, parseAllowList } from './allow.js';
import { createGate, refusalMessage } from './gate.js';
import { startProxy } from './proxy.js';

/** The list of exceptions, the gate that decides, and the proxy that enforces it. */

describe('web policy: exceptions and the gate', () => {
  it('reads WEB_CAPTURE_ALLOW patterns', () => {
    const list = parseAllowList(
      'localhost:5173, *.staging.example.com 192.168.1.*:8080\n[::1]:3000, http://dev.local:8000/x, :9, a:70000',
    );
    assert.deepEqual(
      list.map((pattern) => pattern.text),
      [
        'localhost:5173',
        '*.staging.example.com',
        '192.168.1.*:8080',
        '[::1]:3000',
        'http://dev.local:8000/x',
      ],
    );
    const allowed = (host, port) => isAllowed(list, host, port);
    assert.deepEqual(
      [allowed('localhost', 5173), allowed('LocalHost.', 5173), allowed('localhost', 80)],
      [true, true, false],
    );
    assert.deepEqual(
      [allowed('a.b.staging.example.com', 443), allowed('staging.example.com', 443)],
      [true, false],
    );
    assert.deepEqual([allowed('192.168.1.77', 8080), allowed('192.168.2.77', 8080)], [true, false]);
    assert.equal(
      allowed('192.168.1.evil.com', 8080),
      false,
      'a star in an address stands for digits only',
    );
    assert.deepEqual(
      [allowed('::1', 3000), allowed('[::1]', 3000), allowed('dev.local', 8000)],
      [true, true, true],
    );
    assert.deepEqual(
      [allowed('xlocalhost', 5173), allowed('localhost.evil.com', 5173)],
      [false, false],
    );
    assert.deepEqual(parseAllowList(undefined), []);
    assert.deepEqual(parseAllowList(['a.example', 5, '']).length, 1);
    assert.deepEqual(
      [
        allowHint('LOCALHOST', 8080, 'http:'),
        allowHint('example.com', 443, 'https:'),
        allowHint('::1', 80, 'https:'),
      ],
      ['localhost:8080', 'example.com', '[::1]:80'],
    );
  });

  it('admits public hosts, refuses private ones after resolving, unless allowed', async () => {
    const names = {
      'public.example': ['93.184.216.34'],
      'inside.example': ['10.0.0.5'],
      'mixed.example': ['93.184.216.34', '127.0.0.1'],
      'v6.example': ['fd00::5'],
      'dev.example': ['192.168.1.20'],
    };
    let lookups = 0;
    const lookup = async (host) => {
      lookups++;
      if (!names[host]) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
      return names[host].map((address) => ({ address }));
    };
    const gate = createGate({ allow: 'dev.example:3000, localhost:5173', lookup });
    assert.deepEqual(await gate.admit('public.example', 443), {
      ok: true,
      addresses: ['93.184.216.34'],
      reason: '',
    });
    assert.deepEqual(await gate.admit('PUBLIC.example.', 443), {
      ok: true,
      addresses: ['93.184.216.34'],
      reason: '',
    });
    assert.equal(
      lookups,
      1,
      'a name is resolved once and the answer kept: it cannot change under us',
    );
    const reasons = {
      'inside.example':
        'inside.example is at 10.0.0.5, which is a private address (private network)',
      'mixed.example': 'mixed.example is at 127.0.0.1, which is a private address (loopback)',
      'v6.example': 'v6.example is at fd00::5, which is a private address (unique local)',
      'nowhere.example': 'nowhere.example cannot be found (no such host name)',
      localhost: 'localhost is this machine (loopback)',
      '169.254.169.254': '169.254.169.254 is a private address (link-local)',
      '[::1]': '::1 is a private address (loopback)',
      2130706433: '2130706433 is a private address (loopback)',
    };
    for (const [host, reason] of Object.entries(reasons))
      assert.deepEqual(await gate.admit(host, 80), { ok: false, addresses: [], reason }, host);
    assert.deepEqual(await gate.admit('dev.example', 3000), {
      ok: true,
      addresses: ['192.168.1.20'],
      reason: '',
    });
    assert.equal(
      (await gate.admit('dev.example', 3001)).ok,
      false,
      'another port is another matter',
    );
    assert.deepEqual(await gate.admit('localhost', 5173), {
      ok: true,
      addresses: ['127.0.0.1', '::1'],
      reason: '',
    });
    assert.deepEqual((await gate.admit('8.8.8.8', 53)).addresses, ['8.8.8.8']);
    await gate.admit('inside.example', 80);
    assert.equal(
      gate.refusals.filter((refusal) => refusal.host === 'inside.example').length,
      1,
      'noted once',
    );
    assert.equal(gate.refused('INSIDE.example', 80).reason, reasons['inside.example']);
    assert.equal(gate.refused('public.example', 443), undefined);
    assert.deepEqual(gate.allow, ['dev.example:3000', 'localhost:5173']);
    assert.equal(
      refusalMessage('https://inside.example/login', reasons['inside.example'], '--allow'),
      `https://inside.example/login was refused: ${reasons['inside.example']}. To record it anyway, allow it: --allow inside.example`,
    );
  });

  it('proxies what the gate admits to the very address it checked, and nothing else', async () => {
    const origin = createServer((req, res) => {
      res.writeHead(200, { 'set-cookie': ['a=1', 'b=2'], 'content-type': 'text/plain' });
      res.end(
        `${req.method} ${req.url} host=${req.headers.host} proxy=${req.headers['proxy-connection']}`,
      );
    }).listen(0, '127.0.0.1');
    await once(origin, 'listening');
    const { port } = origin.address();
    // The name resolves to the test server; the gate is told it is public.
    const lookup = async (host) => [
      { address: host === 'site.example' ? '127.0.0.1' : '10.0.0.5' },
    ];
    const gate = createGate({ allow: 'site.example', lookup });
    const proxy = await startProxy(gate);
    const via = (url, headers = {}) =>
      new Promise((resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port: proxy.port,
            path: url,
            headers: { host: new URL(url).host, 'proxy-connection': 'keep-alive', ...headers },
          },
          (res) => {
            let body = '';
            res
              .on('data', (chunk) => (body += chunk))
              .on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
          },
        );
        req.on('error', reject).end();
      });
    const tunnel = async (target) => {
      const socket = connect(proxy.port, '127.0.0.1');
      await once(socket, 'connect');
      socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
      const [first] = await once(socket, 'data');
      return { socket, status: String(first).split('\r\n')[0] };
    };
    try {
      const ok = await via(`http://site.example:${port}/page?x=1`);
      assert.deepEqual(
        [ok.status, ok.body],
        [200, `GET /page?x=1 host=site.example:${port} proxy=undefined`],
      );
      assert.deepEqual(ok.headers['set-cookie'], ['a=1', 'b=2'], 'headers pass through whole');
      const refused = await via('http://inside.example/secret');
      assert.deepEqual([refused.status, refused.body], [403, '']);
      assert.equal(
        gate.refused('inside.example', 80).reason,
        'inside.example is at 10.0.0.5, which is a private address (private network)',
      );
      const open = await tunnel(`site.example:${port}`);
      assert.equal(open.status, 'HTTP/1.1 200 Connection Established');
      open.socket.write(`GET /through HTTP/1.1\r\nHost: site.example\r\nConnection: close\r\n\r\n`);
      const [answer] = await once(open.socket, 'data');
      assert.match(String(answer), /GET \/through host=site\.example/);
      open.socket.destroy();
      const shut = await tunnel('inside.example:443');
      assert.equal(shut.status, 'HTTP/1.1 403 Forbidden');
      shut.socket.destroy();
      // Allowed but not there: the connection breaks, as it would without a proxy.
      await assert.rejects(via('http://site.example:1/'), /socket hang up|ECONNRESET/);
      assert.match(proxy.failures.get('site.example:1'), /ECONNREFUSED/);
      const direct = await fetch(`http://127.0.0.1:${proxy.port}/not-a-proxy-request`);
      assert.equal(direct.status, 400, 'it is a proxy, not a web server');
    } finally {
      await proxy.close();
      await new Promise((done) => origin.close(done));
    }
  });
});
