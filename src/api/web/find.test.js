import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheFolders, findBrowser, newestFirst } from './find.js';
import { browserArgs } from './flags.js';

/** Where the recorder looks for chrome-headless-shell, and how it starts it. */

describe('web recorder: finding the browser', () => {
  const root = mkdtempSync(join(tmpdir(), 'nearedit-find-'));
  after(() => rmSync(root, { recursive: true, force: true }));
  const put = (...parts) => {
    const file = join(root, ...parts);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, '');
    return file;
  };
  const where = (env, platform = 'linux') => ({
    env,
    platform,
    home: join(root, 'home'),
    dataDir: join(root, 'data'),
  });

  it('looks in the order: setting, installed copy, Playwright, Puppeteer', () => {
    assert.equal(findBrowser(where({})), null);
    const puppeteer = put(
      'home/.cache/puppeteer/chrome-headless-shell/linux-131.0.6778.85/chrome-headless-shell-linux64/chrome-headless-shell',
    );
    put(
      'home/.cache/puppeteer/chrome-headless-shell/linux-99.0.1/chrome-headless-shell-linux64/chrome-headless-shell',
    );
    assert.deepEqual(
      findBrowser(where({})),
      { path: puppeteer, source: 'puppeteer' },
      'the newest version',
    );
    put('home/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
    assert.equal(
      findBrowser(where({})).source,
      'puppeteer',
      'ordinary Chromium is not a headless shell',
    );
    const old = put(
      'home/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
    );
    assert.deepEqual(findBrowser(where({})), { path: old, source: 'playwright' });
    const current = put(
      'pw/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
    );
    symlinkSync(current, join(root, 'pw', 'chromium_headless_shell'));
    assert.equal(findBrowser(where({ PLAYWRIGHT_BROWSERS_PATH: join(root, 'pw') })).path, current);
    const installed = put(
      'data/browsers/chrome-headless-shell/140.0.1/chrome-headless-shell-linux64/chrome-headless-shell',
    );
    assert.deepEqual(findBrowser(where({})), { path: installed, source: 'installed' });
    const chosen = { WEB_CAPTURE_BROWSER: join(root, 'nowhere', 'chrome') };
    assert.deepEqual(findBrowser(where(chosen)), {
      path: chosen.WEB_CAPTURE_BROWSER,
      source: 'WEB_CAPTURE_BROWSER',
    });
  });

  it('knows the cache folders and binary names of each platform', () => {
    const home = join(root, 'home');
    assert.deepEqual(cacheFolders({ env: {}, platform: 'darwin', home, dataDir: '' }), {
      playwright: join(home, 'Library', 'Caches', 'ms-playwright'),
      puppeteer: join(home, '.cache', 'puppeteer', 'chrome-headless-shell'),
    });
    const windows = cacheFolders({
      env: { LOCALAPPDATA: join(root, 'Local'), PUPPETEER_CACHE_DIR: join(root, 'pp') },
      platform: 'win32',
      home,
      dataDir: '',
    });
    assert.deepEqual(windows, {
      playwright: join(root, 'Local', 'ms-playwright'),
      puppeteer: join(root, 'pp', 'chrome-headless-shell'),
    });
    assert.equal(
      cacheFolders({ env: { XDG_CACHE_HOME: '/x' }, platform: 'linux', home, dataDir: '' })
        .playwright,
      join('/x', 'ms-playwright'),
    );
    const exe = put(
      'Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe',
    );
    put(
      'Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell',
    );
    assert.equal(findBrowser(where({ LOCALAPPDATA: join(root, 'Local') }, 'win32')).path, exe);
    assert.deepEqual(['a-9', 'a-10', 'a-1243', 'a'].sort(newestFirst), [
      'a-1243',
      'a-10',
      'a-9',
      'a',
    ]);
    assert.deepEqual(
      ['linux-99.0.1', 'linux-131.0.6778.85', 'linux-131.0.6778.9'].sort(newestFirst)[0],
      'linux-131.0.6778.85',
    );
  });

  it('starts Chrome with a private profile, begin-frame control and its only way out', () => {
    const args = browserArgs({
      profileDir: '/tmp/p',
      width: 1280.4,
      height: 720,
      scale: 2,
      proxyPort: 4321,
    });
    for (const flag of [
      '--user-data-dir=/tmp/p',
      '--window-size=1280,720',
      '--force-device-scale-factor=2',
    ])
      assert.ok(args.includes(flag), flag);
    for (const flag of [
      '--enable-begin-frame-control',
      '--run-all-compositor-stages-before-draw',
      '--remote-debugging-pipe',
    ])
      assert.ok(args.includes(flag), flag);
    assert.ok(
      args.includes('--proxy-server=http://127.0.0.1:4321') &&
        args.includes('--proxy-bypass-list=<-loopback>'),
    );
    assert.ok(
      !args.includes('--no-sandbox') && !args.includes('--disable-dev-shm-usage'),
      'the sandbox stays on',
    );
    const bare = browserArgs({
      profileDir: '/tmp/p',
      width: 320,
      height: 240,
      scale: 1,
      noSandbox: true,
      smallShm: true,
    });
    assert.ok(bare.includes('--no-sandbox') && bare.includes('--disable-dev-shm-usage'));
    assert.ok(
      bare.some((flag) => flag.startsWith('--proxy-server=')),
      'without a proxy of ours it still reaches nothing',
    );
    assert.equal(args.at(-1), 'about:blank');
  });
});
