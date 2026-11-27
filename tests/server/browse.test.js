import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { browseRouter } from '../../src/api/browse.js';
import { hasDesktop, pickFolder, pickerRouter } from '../../src/api/picker.js';
import { projectsRouter } from '../../src/api/projects.js';
import { call, createSandbox, q, serve } from './helpers.js';

let box;
let api;
const browse = (path) => call(api.url, 'GET', `/api/browse${path === undefined ? '' : q(path)}`);
const mkdir = (body) => call(api.url, 'POST', '/api/browse/mkdir', body);

before(async () => {
  box = createSandbox('browse');
  for (const name of ['Videos', 'archive 10', 'archive 9', '.cache', 'Videos/2024']) {
    mkdirSync(join(box.home, name));
  }
  writeFileSync(join(box.home, 'readme.txt'), 'a file, not a folder');
  symlinkSync(box.outside, join(box.home, 'escape'));
  symlinkSync(join(box.home, 'Videos'), join(box.home, 'shortcut'));
  api = await serve(projectsRouter, browseRouter, pickerRouter);
  await call(api.url, 'POST', '/api/projects', { name: 'Park', path: box.project });
});
after(async () => {
  await api?.close();
  box?.cleanup();
});

describe('GET /browse', () => {
  it('lists the first browse root when no path is given', async () => {
    const res = await browse();
    assert.equal(res.status, 200);
    assert.equal(res.body.path, box.home);
    assert.equal(res.body.parent, null, 'a browse root has no parent to go up to');
    assert.deepEqual(res.body.roots, [box.home]);
    assert.equal(res.body.hasProject, false);
  });

  it('lists sub-directories only: no files, no dot-folders, no links out of the roots', async () => {
    const { dirs } = (await browse(box.home)).body;
    assert.deepEqual(
      dirs.map((dir) => dir.name),
      ['archive 9', 'archive 10', 'project', 'shortcut', 'Videos'],
    );
    assert.ok(dirs.every((dir) => dir.path === join(box.home, dir.name)));
  });

  it('flags folders that already hold a project', async () => {
    const { dirs } = (await browse(box.home)).body;
    const flags = Object.fromEntries(dirs.map((dir) => [dir.name, dir.hasProject]));
    assert.deepEqual(flags, {
      'archive 9': false,
      'archive 10': false,
      project: true,
      shortcut: false,
      Videos: false,
    });
    assert.equal((await browse(box.project)).body.hasProject, true);
  });

  it('walks down and back up inside the roots', async () => {
    const videos = (await browse(join(box.home, 'Videos'))).body;
    assert.equal(videos.parent, box.home);
    assert.deepEqual(videos.dirs, [
      { name: '2024', path: join(box.home, 'Videos', '2024'), hasProject: false },
    ]);
    const deep = (await browse(join(box.home, 'Videos', '2024'))).body;
    assert.deepEqual([deep.parent, deep.dirs], [join(box.home, 'Videos'), []]);
  });

  it('refuses anything outside the browse roots (403)', async () => {
    for (const path of [
      box.outside,
      box.root,
      '/',
      '/etc',
      join(box.home, '..'),
      join(box.home, 'Videos', '..', '..', 'outside'),
      join(box.home, 'escape'),
      box.data,
    ]) {
      assert.equal((await browse(path)).status, 403, path);
    }
  });

  it('answers 404 for a missing folder or a file', async () => {
    assert.equal((await browse(join(box.home, 'nope'))).status, 404);
    assert.equal((await browse(join(box.home, 'readme.txt'))).status, 404);
  });

  it('serves several roots and starts at the first that exists', async () => {
    const second = join(box.root, 'drive');
    mkdirSync(second);
    process.env.BROWSE_ROOTS = `${join(box.root, 'unplugged')},${second},${box.home}`;
    try {
      const res = await browse();
      assert.equal(res.body.path, second);
      assert.deepEqual(res.body.roots, [second, box.home]);
      assert.equal((await browse(box.home)).status, 200);
    } finally {
      process.env.BROWSE_ROOTS = box.home;
    }
    assert.equal((await browse(second)).status, 403);
  });
});

describe('POST /browse/mkdir', () => {
  it('creates a folder and returns its path', async () => {
    const res = await mkdir({ path: box.home, name: 'New Project' });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { path: join(box.home, 'New Project') });
    assert.ok(existsSync(res.body.path));
    const listed = (await browse(box.home)).body.dirs.map((dir) => dir.name);
    assert.ok(listed.includes('New Project'));
  });

  it('answers 409 when the name is taken', async () => {
    assert.equal((await mkdir({ path: box.home, name: 'Videos' })).status, 409);
    assert.equal((await mkdir({ path: box.home, name: 'readme.txt' })).status, 409);
  });

  it('refuses names that could leave the folder or hide it (422)', async () => {
    for (const name of [
      '',
      '   ',
      '..',
      '.',
      '.hidden',
      'a/b',
      '../outside/x',
      'a\\b',
      'x\u0000y',
      42,
    ]) {
      const res = await mkdir({ path: box.home, name });
      assert.equal(res.status, 422, JSON.stringify(name));
      assert.ok(res.body.fields.name);
    }
    assert.equal((await mkdir({ name: 'orphan' })).status, 422);
    assert.ok(!existsSync(join(box.outside, 'x')));
  });

  it('refuses parents outside the browse roots (403) and missing parents (404)', async () => {
    assert.equal((await mkdir({ path: box.outside, name: 'x' })).status, 403);
    assert.equal((await mkdir({ path: join(box.home, 'escape'), name: 'x' })).status, 403);
    assert.equal((await mkdir({ path: '/', name: 'nearedit-test' })).status, 403);
    assert.ok(!existsSync(join(box.outside, 'x')));
    assert.equal((await mkdir({ path: join(box.home, 'nope'), name: 'x' })).status, 404);
  });
});

describe('POST /pick-folder', () => {
  it('answers 204 at once on a headless server', async () => {
    const saved = { DISPLAY: process.env.DISPLAY, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY };
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    try {
      const started = Date.now();
      const res = await call(api.url, 'POST', '/api/pick-folder');
      assert.equal(res.status, 204);
      assert.equal(res.text, '');
      assert.ok(Date.now() - started < 1000, 'must not wait for a dialog that cannot appear');
    } finally {
      for (const [key, value] of Object.entries(saved)) if (value) process.env[key] = value;
    }
  });

  it('knows which environments have a desktop', () => {
    assert.equal(hasDesktop('linux', {}), false);
    assert.equal(hasDesktop('linux', { DISPLAY: ':0' }), true);
    assert.equal(hasDesktop('linux', { WAYLAND_DISPLAY: 'wayland-0' }), true);
    assert.equal(hasDesktop('darwin', {}), true);
    assert.equal(hasDesktop('freebsd', { DISPLAY: ':0' }), false);
  });

  it('runs the platform dialog and returns the chosen folder (fake process runner)', async () => {
    const calls = [];
    const missing = Object.assign(new Error('spawn zenity ENOENT'), { code: 'ENOENT' });
    const exec = async (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      if (cmd === 'zenity') throw missing;
      return { stdout: '/home/someone/Videos\n' };
    };
    const env = { DISPLAY: ':0' };
    assert.equal(await pickFolder({ os: 'linux', env, exec }), '/home/someone/Videos');
    assert.deepEqual(
      calls.map((entry) => entry.cmd),
      ['zenity', 'kdialog'],
    );
    assert.ok(calls.every((entry) => Array.isArray(entry.args) && entry.opts.timeout > 0));

    const mac = async () => ({ stdout: '/Users/someone/Movies/\n' });
    assert.equal(await pickFolder({ os: 'darwin', env: {}, exec: mac }), '/Users/someone/Movies');
  });

  it('returns null when the dialog is cancelled, missing, or there is no desktop', async () => {
    const cancelled = async () => {
      throw Object.assign(new Error('zenity exited 1'), { code: 1 });
    };
    const absent = async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    };
    const never = async () => assert.fail('no dialog may be started without a desktop');
    const env = { DISPLAY: ':0' };
    assert.equal(await pickFolder({ os: 'linux', env, exec: cancelled }), null);
    assert.equal(await pickFolder({ os: 'linux', env, exec: absent }), null);
    assert.equal(await pickFolder({ os: 'linux', env: {}, exec: never }), null);
    assert.equal(
      await pickFolder({ os: 'win32', env, exec: async () => ({ stdout: '\r\n' }) }),
      null,
    );
  });
});
