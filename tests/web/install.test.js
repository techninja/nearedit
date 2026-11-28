import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser } from '../../src/api/web/find.js';
import { feedPlatform, installBrowser } from '../../src/api/web/install.js';
import { unzip } from '../../src/api/web/unzip.js';
import * as kit from './kit.js';

/**
 * The browser installer, against a stand-in for Chrome for Testing: a list
 * of builds and a small archive, served from this machine.
 */

const SCRIPT = fileURLToPath(new URL('../../scripts/install-browser.js', import.meta.url));
const ZIP = `
import sys, zipfile
out, shell = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w') as z:
    def add(name, data, mode, method=zipfile.ZIP_DEFLATED):
        info = zipfile.ZipInfo(name)
        info.external_attr = mode << 16
        info.compress_type = method
        z.writestr(info, data)
    add('chrome-headless-shell-linux64/', '', 0o40755, zipfile.ZIP_STORED)
    add('chrome-headless-shell-linux64/chrome-headless-shell', shell, 0o100755)
    add('chrome-headless-shell-linux64/locales/en-US.pak', 'x' * 5000, 0o100644)
    add('chrome-headless-shell-linux64/LICENSE', 'stored as it is', 0o100644, zipfile.ZIP_STORED)
    add('chrome-headless-shell-linux64/libEGL.so', 'libEGL.so.1', 0o120777, zipfile.ZIP_STORED)
    if len(sys.argv) > 3:
        add('../outside.txt', 'escaped', 0o100644)
`;

describe('browser installer', () => {
  const root = join(kit.SCRATCH, 'install');
  const hits = [];
  let server;
  let base;
  const zip = (name, shell, ...more) => {
    execFileSync('python3', ['-c', ZIP, join(root, name), shell, ...more]);
    return join(root, name);
  };
  const feed = (downloads, version = '999.0.1.2') =>
    JSON.stringify({
      channels: { Stable: { version, downloads: { 'chrome-headless-shell': downloads } } },
    });
  const install = (more = {}) => {
    const lines = [];
    const options = {
      dataDir: join(root, 'data'),
      feed: `${base}/feed.json`,
      platform: 'linux',
      arch: 'x64',
    };
    const verify = async (path) => (lines.push(`verified ${path}`), '');
    return installBrowser({ ...options, log: (line) => lines.push(line), verify, ...more }).then(
      (result) => ({ ...result, lines }),
    );
  };

  before(async () => {
    mkdirSync(root, { recursive: true });
    zip('fake.zip', '#!/bin/sh\necho "not really a browser" >&2\nexit 3\n');
    zip('slip.zip', '#!/bin/sh\n', 'slip');
    // A stand-in that is the real browser: enough for the installer's own check to pass.
    if (kit.BROWSER) zip('real.zip', `#!/bin/sh\nexec "${kit.BROWSER}" "$@"\n`);
    writeFileSync(join(root, 'junk.zip'), 'this is not an archive');
    server = createServer((req, res) => {
      hits.push(req.url);
      const [, name] = /^\/(\w+)\.zip$/.exec(req.url) || [];
      if (name) return void res.end(readFileSync(join(root, `${name}.zip`)));
      const which = /^\/feed-?(\w*)\.json$/.exec(req.url)?.[1];
      if (which === undefined) return void res.writeHead(404).end();
      const entry = {
        platform: which === 'mac' ? 'mac-arm64' : 'linux64',
        url: `${base}/${which || 'fake'}.zip`,
      };
      res.end(feed([{ platform: 'win64', url: `${base}/nope.zip` }, entry]));
    }).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
    kit.cleanup();
  });

  it('knows which build a machine needs', () => {
    const names = [
      ['linux', 'x64'],
      ['darwin', 'arm64'],
      ['darwin', 'x64'],
      ['win32', 'x64'],
      ['win32', 'ia32'],
      ['linux', 'arm64'],
    ];
    assert.deepEqual(
      names.map(([platform, arch]) => feedPlatform(platform, arch)),
      ['linux64', 'mac-arm64', 'mac-x64', 'win64', 'win32', ''],
    );
  });

  it('downloads, unpacks and checks the stable build — once', async () => {
    const first = await install();
    const folder = join(
      root,
      'data',
      'browsers',
      'chrome-headless-shell',
      '999.0.1.2',
      'chrome-headless-shell-linux64',
    );
    assert.deepEqual(
      [first.path, first.version, first.downloaded],
      [join(folder, 'chrome-headless-shell'), '999.0.1.2', true],
    );
    assert.ok(statSync(first.path).mode & 0o100, 'it can be run');
    assert.equal(
      statSync(join(folder, 'LICENSE')).mode & 0o111,
      0,
      'what was not executable is not',
    );
    assert.equal(readFileSync(join(folder, 'LICENSE'), 'utf8'), 'stored as it is');
    assert.equal(readFileSync(join(folder, 'locales', 'en-US.pak'), 'utf8').length, 5000);
    assert.ok(lstatSync(join(folder, 'libEGL.so')).isSymbolicLink());
    assert.equal(readlinkSync(join(folder, 'libEGL.so')), 'libEGL.so.1');
    assert.deepEqual(
      readdirSync(join(root, 'data', 'browsers', 'chrome-headless-shell')),
      ['999.0.1.2'],
      'no archive, no half-unpacked folder',
    );
    assert.match(
      first.lines.join('\n'),
      /Downloading chrome-headless-shell 999\.0\.1\.2 for linux64\n {2}from http.*fake\.zip\nUnpacked 4 files/,
    );
    assert.equal(first.lines.at(-2), `verified ${first.path}`);
    assert.deepEqual(findBrowser({ env: {}, home: root, dataDir: join(root, 'data') }), {
      path: first.path,
      source: 'installed',
    });

    const downloads = () => hits.filter((url) => url.endsWith('.zip')).length;
    const again = await install();
    assert.deepEqual([again.downloaded, downloads()], [false, 1]);
    assert.equal(again.lines[0], 'chrome-headless-shell 999.0.1.2 is already installed');
    assert.equal((await install({ force: true })).downloaded, true);
    assert.equal(downloads(), 2);
  });

  it('says what went wrong, and leaves nothing half-installed', async () => {
    const data = join(root, 'other');
    const fresh = { dataDir: data };
    await assert.rejects(
      install({ ...fresh, arch: 'arm64' }),
      /no chrome-headless-shell for linux-arm64\. Playwright builds one/,
    );
    await assert.rejects(
      install({ ...fresh, feed: `${base}/missing.json` }),
      /Cannot download the list of Chrome builds \(.*missing\.json\): HTTP 404/,
    );
    await assert.rejects(
      install({ ...fresh, feed: 'http://127.0.0.1:9/feed.json' }),
      /Cannot download the list of Chrome builds .*: \w+/,
    );
    await assert.rejects(
      install({ ...fresh, feed: `${base}/feed-mac.json` }),
      /lists no chrome-headless-shell for linux64/,
    );
    await assert.rejects(
      install({ ...fresh, feed: `${base}/feed-junk.json` }),
      /is not a ZIP archive/,
    );
    await assert.rejects(
      install({ ...fresh, feed: `${base}/feed-slip.json` }),
      /names a path outside the folder: \.\.\/outside\.txt/,
    );
    assert.equal(existsSync(join(data, 'browsers', 'chrome-headless-shell', 'outside.txt')), false);
    assert.deepEqual(readdirSync(join(data, 'browsers', 'chrome-headless-shell')), []);
    const broken = install({
      ...fresh,
      verify: async () => 'error while loading shared libraries: libnss3.so',
    });
    await assert.rejects(
      broken,
      /It is installed at .*chrome-headless-shell, but does not start: error while loading shared libraries/,
    );
    writeFileSync(join(root, 'cut.zip'), readFileSync(join(root, 'fake.zip')).subarray(40));
    assert.throws(
      () => unzip(join(root, 'cut.zip'), join(root, 'cut')),
      /is damaged|ends too early|not a ZIP/,
    );
  });

  it(
    'runs as a script: installs into the data folder and starts what it installed',
    { skip: kit.SKIP },
    async () => {
      // Not spawnSync: the list and the archive are served by this very process.
      const run = (feedName, ...args) =>
        new Promise((resolve) => {
          const env = { ...process.env, NEAREDIT_DATA_DIR: join(root, 'script') };
          Object.assign(env, { HTTPS_PROXY: '', https_proxy: '' });
          const feedUrl = `${base}/${feedName}.json`;
          const child = spawn(process.execPath, [SCRIPT, '--feed', feedUrl, ...args], { env });
          const said = { out: '', err: '' };
          child.stdout.on('data', (chunk) => (said.out += chunk));
          child.stderr.on('data', (chunk) => (said.err += chunk));
          child.on('close', (status) => resolve({ status, ...said }));
        });
      const done = await run('feed-real');
      assert.equal(done.status, 0, done.err);
      assert.match(
        done.out,
        /Downloading chrome-headless-shell 999\.0\.1\.2 for linux64[\s\S]*It starts: .*Chrome\/\d+[\s\S]*Ready: .*script/,
      );
      const bad = await run('feed', '--force');
      assert.equal(bad.status, 1);
      assert.match(
        bad.err,
        /It is installed at .*, but does not start: The browser could not start/,
      );
      // A mistyped option must stop before anything is fetched — and could reach nothing here anyway.
      const nowhere = ['--feed', 'http://127.0.0.1:9/feed.json', '--nonsense'];
      const usage = spawnSync(process.execPath, [SCRIPT, ...nowhere], {
        encoding: 'utf8',
        env: { ...process.env, NEAREDIT_DATA_DIR: join(root, 'usage') },
      });
      assert.equal(existsSync(join(root, 'usage')), false);
      assert.equal(usage.status, 2);
    },
  );
});
