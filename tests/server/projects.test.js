import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { projectsRouter } from '../../src/api/projects.js';
import { call, createSandbox, serve } from './helpers.js';

let box;
let api;
const projectFile = (dir) => join(dir, '.nearedit', 'project.json');
const readFile = (dir) => JSON.parse(readFileSync(projectFile(dir), 'utf-8'));

before(async () => {
  box = createSandbox('projects');
  api = await serve(projectsRouter);
});
after(async () => {
  await api?.close();
  box?.cleanup();
});

describe('creating projects', () => {
  let created;

  it('creates the project file with a default 16:9 adaptation', async () => {
    const res = await call(api.url, 'POST', '/api/projects', { name: 'Park', path: box.project });
    assert.equal(res.status, 201);
    created = res.body;
    assert.equal(created.name, 'Park');
    assert.equal(created.path, box.project);
    assert.equal(created.status, 'active');
    assert.equal(created.available, true);
    assert.deepEqual(created.mediaFolders, []);
    assert.equal(created.adaptations.length, 1);
    const [main] = created.adaptations;
    assert.deepEqual(
      [main.aspectRatio, main.resolution, main.fps, main.status, main.parentAdaptationId],
      ['16:9', '1920x1080', 30, 'draft', ''],
    );
    assert.equal(main.projectId, created.id);
    assert.equal(main.edl, undefined, 'EDLs are not embedded in project responses');
    const onDisk = readFile(box.project);
    assert.equal(onDisk.id, created.id);
    assert.equal(onDisk.adaptations[0].edl.version, 3);
    assert.equal(onDisk.adaptations[0].edl.tracks.length, 2);
  });

  it('registers it and writes atomically (no temp files left)', () => {
    const registry = JSON.parse(readFileSync(join(box.data, 'registry.json'), 'utf-8'));
    assert.deepEqual(registry[created.id], { path: box.project, name: 'Park' });
    assert.deepEqual(readdirSync(join(box.project, '.nearedit')), ['project.json']);
    assert.deepEqual(readdirSync(box.data), ['registry.json']);
  });

  it('creates the folder when it does not exist yet', async () => {
    const dir = join(box.home, 'new', 'nested', 'folder');
    const res = await call(api.url, 'POST', '/api/projects', { name: 'Fresh', path: dir });
    assert.equal(res.status, 201);
    assert.ok(existsSync(projectFile(dir)));
  });

  it('re-registers an existing project instead of overwriting it', async () => {
    const res = await call(api.url, 'POST', '/api/projects', { name: 'Other', path: box.project });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, created.id);
    assert.equal(res.body.name, 'Park', 'the name on disk wins');
    assert.equal(readFile(box.project).createdAt, created.createdAt);
  });

  it('re-registers without a name after being unregistered, keeping its timeline', async () => {
    const aid = created.adaptations[0].id;
    const edl = { tracks: [{ trackId: 'v1', type: 'video', clips: [] }], fps: 24 };
    await call(api.url, 'PUT', `/api/projects/${created.id}/edl/${aid}`, edl);
    assert.equal((await call(api.url, 'DELETE', `/api/projects/${created.id}`)).status, 204);
    assert.equal((await call(api.url, 'GET', `/api/projects/${created.id}`)).status, 404);
    assert.ok(existsSync(projectFile(box.project)), 'unregistering never deletes files');

    const res = await call(api.url, 'POST', '/api/projects', { path: box.project });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, created.id);
    assert.equal(res.body.adaptations[0].fps, 24);
  });

  it('gives a copied project folder an id of its own', async () => {
    const copy = join(box.home, 'project-copy');
    cpSync(box.project, copy, { recursive: true });
    const res = await call(api.url, 'POST', '/api/projects', { path: copy });
    assert.equal(res.status, 201);
    assert.notEqual(res.body.id, created.id);
    assert.equal(readFile(copy).id, res.body.id);
    assert.equal(
      (await call(api.url, 'GET', `/api/projects/${created.id}`)).body.path,
      box.project,
    );
  });

  it('refuses a project file it cannot read rather than replacing it', async () => {
    const dir = join(box.home, 'corrupt');
    mkdirSync(join(dir, '.nearedit'), { recursive: true });
    writeFileSync(projectFile(dir), '{ not json');
    const res = await call(api.url, 'POST', '/api/projects', { name: 'X', path: dir });
    assert.equal(res.status, 409);
    assert.equal(readFileSync(projectFile(dir), 'utf-8'), '{ not json');
  });

  it('refuses bad input', async () => {
    const post = (body) => call(api.url, 'POST', '/api/projects', body);
    const noName = await post({ path: join(box.home, 'nameless') });
    assert.equal(noName.status, 422);
    assert.ok(noName.body.fields.name);
    assert.ok(!existsSync(join(box.home, 'nameless')), 'nothing is created on a refusal');
    assert.equal((await post({ name: 'A', path: 'relative/dir' })).status, 422);
    assert.equal((await post({ name: 'A' })).status, 422);
    assert.equal((await post({ name: 'A', path: projectFile(box.project) })).status, 422);
  });

  it('refuses paths outside the browse roots (403)', async () => {
    const post = (path) => call(api.url, 'POST', '/api/projects', { name: 'Evil', path });
    assert.equal((await post(box.outside)).status, 403);
    assert.equal((await post(join(box.home, '..', 'outside', 'sub'))).status, 403);
    assert.equal((await post('/etc/nearedit-test')).status, 403);
    assert.ok(!existsSync(join(box.outside, '.nearedit')));
    assert.ok(!existsSync(join(box.outside, 'sub')));
  });

  it('refuses a new folder reached through a symlink that leaves the roots', async () => {
    symlinkSync(box.outside, join(box.home, 'escape'));
    const path = join(box.home, 'escape', 'smuggled');
    const res = await call(api.url, 'POST', '/api/projects', { name: 'Evil', path });
    assert.equal(res.status, 403);
    assert.ok(!existsSync(join(box.outside, 'smuggled')));
  });
});

describe('reading and updating projects', () => {
  let project;
  before(async () => {
    const dir = join(box.home, 'second');
    project = (await call(api.url, 'POST', '/api/projects', { name: 'Second', path: dir })).body;
  });

  it('lists every registered project', async () => {
    const res = await call(api.url, 'GET', '/api/projects');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, res.body.data.length);
    const listed = res.body.data.find((p) => p.id === project.id);
    assert.equal(listed.name, 'Second');
    assert.equal(listed.adaptations.length, 1);
  });

  it('keeps listing a project whose folder is unreachable', async () => {
    const dir = join(box.home, 'unplugged');
    const made = (await call(api.url, 'POST', '/api/projects', { name: 'Gone', path: dir })).body;
    rmSync(dir, { recursive: true });
    const listed = (await call(api.url, 'GET', '/api/projects')).body.data;
    const entry = listed.find((p) => p.id === made.id);
    assert.equal(entry.available, false);
    assert.equal(entry.name, 'Gone');
    assert.equal((await call(api.url, 'GET', `/api/projects/${made.id}`)).status, 404);
  });

  it('answers 404 for unknown ids', async () => {
    assert.equal((await call(api.url, 'GET', '/api/projects/nope')).status, 404);
    assert.equal((await call(api.url, 'PUT', '/api/projects/nope', { name: 'x' })).status, 404);
    assert.equal((await call(api.url, 'DELETE', '/api/projects/nope')).status, 404);
    assert.equal((await call(api.url, 'GET', '/api/projects/__proto__')).status, 404);
  });

  it('shallow-merges the fields a client may change and nothing else', async () => {
    const patch = { name: 'Renamed', description: 'Spring', status: 'archived', id: 'hijack' };
    const res = await call(api.url, 'PUT', `/api/projects/${project.id}`, {
      ...patch,
      adaptations: [],
      createdAt: 'never',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, project.id);
    assert.deepEqual(
      [res.body.name, res.body.description, res.body.status],
      ['Renamed', 'Spring', 'archived'],
    );
    assert.equal(res.body.adaptations.length, 1);
    assert.equal(res.body.createdAt, project.createdAt);
    const registry = JSON.parse(readFileSync(join(box.data, 'registry.json'), 'utf-8'));
    assert.equal(registry[project.id].name, 'Renamed');
  });

  it('validates updates (422 with field messages)', async () => {
    const put = (body) => call(api.url, 'PUT', `/api/projects/${project.id}`, body);
    const bad = await put({ status: 'deleted', name: '' });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['name', 'status']);
    assert.equal((await put({ mediaFolders: 'not-an-array' })).status, 422);
    assert.equal((await put({ mediaFolders: [join(box.home, 'missing')] })).status, 422);
  });

  it('accepts media folders inside the browse roots and refuses others (403)', async () => {
    const footage = join(box.home, 'footage');
    mkdirSync(footage);
    const put = (mediaFolders) =>
      call(api.url, 'PUT', `/api/projects/${project.id}`, { mediaFolders });
    const ok = await put([footage, footage]);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.mediaFolders, [footage]);
    assert.equal((await put([footage, box.outside])).status, 403);
    assert.equal((await put(['/'])).status, 403);
    const still = await call(api.url, 'GET', `/api/projects/${project.id}`);
    assert.deepEqual(still.body.mediaFolders, [footage]);
  });
});
