import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { siteDemo } from '../actions/siteDemo.js';
import { precheck } from '../request.js';
import { checkRecorder, checkSite } from './check.js';
import { fakeRecorder } from './testing/fakeRecorder.js';
import { demoContext, scratchProject } from './testing/kit.js';

const DIR = scratchProject();
const run = (directive, extra, recorder = fakeRecorder()) =>
  siteDemo(demoContext(DIR, directive, extra), recorder);
afterEach(() => delete process.env.WEB_CAPTURE_ALLOW);

test('without an address, or with one the recorder may not open, the request is refused at once', () => {
  const refused = (url, field, message) => {
    const { directive } = demoContext(DIR, { params: { url } });
    assert.throws(
      () => checkSite(directive),
      (err) => {
        assert.equal(err.status, 422, url);
        assert.match(err.fields['params.url'], field, url);
        if (message) assert.match(err.message, message, url);
        return true;
      },
    );
  };
  const { directive } = demoContext(DIR, {});
  delete directive.params.url;
  assert.throws(() => checkSite(directive), /Give the address of the page to demo/);
  refused('   ', /missing/);
  for (const url of [
    'ftp://example.com/a',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'just words',
    'http://',
  ])
    refused(url, /Must start with http:\/\/ or https:\/\//, /is not a web address/);
  // Private on its face: the recorder's own explanation, with the way to allow it.
  refused(
    'http://127.0.0.1:3000/',
    /^127\.0\.0\.1 is a private address \(loopback\)$/,
    /^http:\/\/127\.0\.0\.1:3000\/ was refused: 127\.0\.0\.1 is a private address \(loopback\)\. To record it anyway, allow it: WEB_CAPTURE_ALLOW=127\.0\.0\.1:3000$/,
  );
  refused(
    'http://localhost:5173/app',
    /^localhost is this machine \(loopback\)$/,
    /WEB_CAPTURE_ALLOW=localhost:5173/,
  );
  refused('https://10.0.0.5/', /private network/);
  refused('http://[::1]/', /loopback/);
  refused('http://169.254.169.254/latest/meta-data', /link-local/);
  const ok = (url) => checkSite(demoContext(DIR, { params: { url } }).directive);
  assert.equal(ok('https://example.com/pricing?x=1'), 'https://example.com/pricing?x=1');
  assert.equal(ok('example.com/pricing'), 'https://example.com/pricing', 'a bare address is https');
  process.env.WEB_CAPTURE_ALLOW = 'localhost:5173, 127.0.0.1:3000';
  assert.equal(ok('http://localhost:5173/app'), 'http://localhost:5173/app');
  assert.equal(ok('http://127.0.0.1:3000/'), 'http://127.0.0.1:3000/');
  refused('http://127.0.0.1:3001/', /private address/);
});

test('without a browser the job fails at once, in the recorder’s words', async () => {
  const none = fakeRecorder({
    available: false,
    reason: 'No chrome-headless-shell was found. Run "npm run install-browser".',
  });
  await assert.rejects(run({ prompt: 'click Pricing' }, {}, none), (err) => {
    assert.equal(err.status, 422);
    assert.equal(
      err.message,
      'A site demo needs a browser to record with. No chrome-headless-shell was found. Run "npm run install-browser".',
    );
    return true;
  });
  assert.deepEqual([none.looks.length, none.recordings.length], [0, 0], 'nothing was started');
  assert.equal(await checkRecorder(fakeRecorder()), '/fake/chrome-headless-shell');
  // The same question, for a route to ask before it starts a job.
  const prepared = (id) => /** @type {any} */ ({ action: { id } });
  await assert.rejects(precheck(prepared('site_demo'), none), (err) => err.status === 422);
  await precheck(prepared('site_demo'), fakeRecorder());
  await precheck(prepared('motion_piece'), none);
  await assert.rejects(
    run({ params: { url: 'http://10.1.2.3/' } }),
    /10\.1\.2\.3 is a private address/,
  );
});
