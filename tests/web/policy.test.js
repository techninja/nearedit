import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { readStorage } from '../../src/api/web/storage.js';
import * as kit from './kit.js';
import { startSite } from './site.js';

/**
 * What the recording browser may load. The test site stands for a public
 * one (it is allowed by name); its second server stands for the machine's
 * own network, and writes down every request that reaches it.
 */

const { near } = kit;

describe('web recorder: what the browser may load', { skip: kit.SKIP }, () => {
  let site;
  let rec;
  const both = () => `${site.allow}, 127.0.0.1:${site.other.port}`;
  before(async () => {
    site = await startSite();
    rec = (recipe, options = {}) => kit.record(recipe, { allow: site.allow, ...options });
  });
  after(async () => {
    await site.close();
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
    kit.cleanup();
  });

  it('refuses a private page, naming the address and the setting', async () => {
    const url = `${site.url}/`;
    const host = `127.0.0.1:${site.port}`;
    const dir = join(kit.SCRATCH, 'refused');
    await assert.rejects(rec({ url }, { allow: '', dir }), (err) => {
      assert.equal(
        err.message,
        `${url} was refused: 127.0.0.1 is a private address (loopback). ` +
          `To record it anyway, allow it: WEB_CAPTURE_ALLOW=${host}`,
      );
      assert.equal(err.status, 403);
      return true;
    });
    assert.deepEqual(readdirSync(dir), [], 'and nothing was written');
    await assert.rejects(
      rec({ url }, { allow: 'example.com, 127.0.0.1:1', setting: '--allow' }),
      new RegExp(`allow it: --allow ${host}$`),
    );
    // A name for this machine is refused as such, and allowed by that name.
    const named = `http://localhost:${site.port}/`;
    await assert.rejects(
      rec({ url: named }),
      /localhost is this machine \(loopback\).*=localhost:\d+$/,
    );
    const allowed = await rec({ url: named }, { allow: `localhost:${site.port}` });
    assert.equal(allowed.track.title, 'NearEdit test site');
  });

  it('refuses a redirect to a private address and a page that cannot be reached', async () => {
    await assert.rejects(rec({ url: `${site.url}/redirect-private` }), (err) => {
      assert.match(
        err.message,
        new RegExp(`^${site.other.url}/secret.html was refused: 127.0.0.1 is a private`),
      );
      return true;
    });
    assert.deepEqual(site.other.hits, [], 'the other server never heard of it');
    // A port nothing listens on: taken from the system, then given back.
    const gone = createServer().listen(0, '127.0.0.1');
    await once(gone, 'listening');
    const { port } = gone.address();
    await new Promise((done) => gone.close(done));
    await assert.rejects(
      rec({ url: `http://127.0.0.1:${port}/` }, { allow: `127.0.0.1:${port}` }),
      /WebError: http:\/\/127\.0\.0\.1:\d+\/ could not be loaded: connect ECONNREFUSED/,
    );
    await assert.rejects(
      rec({ url: `${site.url}/download` }),
      /\/download (is a download|could not be loaded)/,
    );
    await assert.rejects(
      rec({ url: 'http://no-such-host.invalid/' }),
      /no-such-host\.invalid cannot be found \(no such host name\)/,
    );
  });

  it('keeps frames, pictures, requests, sockets and workers away from private addresses', async () => {
    const url = `${site.url}/embed.html?other=${encodeURIComponent(site.other.url)}`;
    const steps = [{ do: 'wait', duration: 0.3 }];
    const kept = await rec({ url, steps });
    assert.deepEqual(site.other.hits, [], 'nothing reached the other server');
    const last = kept.frames.count - 1;
    assert.ok(near(kept.frames.at(last, 40, 160), [0, 255, 0]), 'the page saw every attempt fail');
    assert.ok(near(kept.frames.at(last, 120, 70), [255, 255, 255]), 'and the frame stayed empty');
    assert.deepEqual(kept.track.warnings, [
      `127.0.0.1:${site.other.port} was not loaded: 127.0.0.1 is a private address (loopback)`,
    ]);

    const open = await rec({ url, steps }, { allow: both() });
    const reached = [...new Set(site.other.hits)].sort();
    assert.deepEqual(reached, [
      'GET /secret.html',
      'GET /secret.json',
      'GET /secret.png',
      'GET /worker.json',
      'UPGRADE /socket',
    ]);
    assert.ok(
      near(open.frames.at(open.frames.count - 1, 120, 70), [255, 0, 0]),
      'the frame shows it',
    );
    assert.deepEqual(open.track.warnings, []);
  });

  it('records only web pages, grants nothing, and dismisses dialogs', async () => {
    const leave =
      "location.href = URL.createObjectURL(new Blob(['<h1>hi</h1>'], { type: 'text/html' }))";
    await assert.rejects(
      rec({ url: `${site.url}/`, steps: [{ do: 'run', js: leave, hold: 0.5 }] }),
      /: blob:http:\/\/127\.0\.0\.1:\d+\/[\w-]+ is not a web page: only http and https are recorded$/,
    );
    const asked = [
      "navigator.geolocation.getCurrentPosition(() => (document.title = 'granted'), () => (document.title = 'denied'))",
      "Notification.requestPermission().then((answer) => (document.title += ' ' + answer))",
    ];
    // Asking for a place is refused; asking to notify is left unanswered, which grants nothing.
    const denied =
      'if (!/^denied (default|denied)$/.test(document.title)) throw new Error(document.title)';
    await rec({
      url: `${site.url}/second.html`,
      steps: [
        { do: 'run', js: asked.join(';'), hold: 0.3 },
        { do: 'run', js: denied },
      ],
    });

    const file = join(kit.SCRATCH, 'state.json');
    const state = {
      cookies: [
        {
          name: 'session',
          value: 'abc123',
          domain: '127.0.0.1',
          path: '/',
          expires: -1,
          sameSite: 'Lax',
        },
      ],
      origins: [{ origin: site.url, localStorage: [{ name: 'token', value: 'secret-token' }] }],
    };
    writeFileSync(file, JSON.stringify(state));
    const signedIn = await rec({ url: `${site.url}/login.html` }, { storage: readStorage(file) });
    assert.equal(signedIn.track.title, 'cookie=abc123 token=secret-token worker=refused');
    assert.ok(
      near(signedIn.frames.at(0, 40, 40), [0, 255, 0]),
      'the cookie was there when the page loaded',
    );
    assert.ok(near(signedIn.frames.at(0, 100, 40), [0, 0, 255]), 'and so was local storage');
    assert.deepEqual(signedIn.track.warnings, [
      'The page opened a dialog (alert: "Hello from the page"); it was dismissed',
    ]);
    const plain = await rec({ url: `${site.url}/login.html` });
    assert.equal(
      plain.track.title,
      'cookie= token= worker=refused',
      'every recording starts empty',
    );

    const broken = await rec({ url: `${site.url}/broken` });
    assert.deepEqual(broken.track.warnings, [`${site.url}/broken answered with HTTP 500`]);
    writeFileSync(file, '{ "cookies": [{ "value": 1 }] }');
    assert.throws(
      () => readStorage(file),
      /state\.json has a cookie without a name and a domain \(cookies\[0\]\)/,
    );
    assert.throws(() => readStorage(`${file}.nope`), /does not exist/);
  });
});
