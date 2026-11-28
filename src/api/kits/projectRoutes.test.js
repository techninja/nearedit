import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { rawGet } from '../../../tests/server/http.js';
import { createEdl, insertElement } from '#utils/edl/index.js';
import { PNG, call, createKitSandbox, send } from './testkit.js';

let sand;
let base;
let own;
const get = (path) => call(sand.url, 'GET', `/api${path}`);
const put = (path, body) => call(sand.url, 'PUT', `/api${path}`, body);
const onDisk = () =>
  JSON.parse(readFileSync(join(sand.box.project, '.nearedit', 'project.json'), 'utf8'));
const media = (path) => rawGet(`${sand.url}/api/media/file?path=${encodeURIComponent(path)}`);
const levels = (body) => body.problems.map((problem) => `${problem.level} ${problem.path}`);

before(async () => {
  sand = await createKitSandbox('kit-project');
  base = `/projects/${sand.project.id}`;
  own = join(sand.box.project, '.nearedit', 'kit');
  const acme = {
    name: 'Acme',
    tokens: { color: { primary: '#4f46e5' }, logo: { main: 'logo.png' } },
  };
  await put('/kits/acme', { kit: acme });
  await send(sand.url, '/api/kits/acme/files/logo.png', PNG);
});
after(() => sand?.close());

describe('GET /projects/:id/kit', () => {
  it('is builtin:clean when nothing was chosen', async () => {
    const { status, body } = await get(`${base}/kit`);
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(body), [
      ...['choice', 'id', 'source', 'kit', 'effective', 'key', 'chain', 'files', 'problems'],
    ]);
    assert.deepEqual(
      [body.choice, body.chain, body.files, body.problems],
      [...['builtin:clean', ['builtin:clean'], [], []]],
    );
    assert.equal(body.key, (await get('/kits/builtin%3Aclean')).body.key);
    assert.equal(onDisk().kit, undefined);
  });

  it('answers 404 for a project or an adaptation that is not there', async () => {
    assert.equal((await get('/projects/nobody/kit')).status, 404);
    assert.equal((await get(`${base}/kit?adaptation=nothing`)).status, 404);
    assert.equal((await put('/projects/nobody/kit', { choice: 'acme' })).status, 404);
    assert.equal((await send(sand.url, '/api/projects/nobody/kit/files/a.png', PNG)).status, 404);
    assert.equal((await get(`${base}/kit/files/a.png`)).status, 404, 'files are read as media');
  });
});

describe('PUT /projects/:id/kit', () => {
  it('chooses a library kit or a built-in one, and keeps the rest of the project file', async () => {
    const before = onDisk();
    const { status, body } = await put(`${base}/kit`, { choice: 'acme' });
    assert.equal(status, 200);
    assert.deepEqual([body.choice, body.id, body.source], ['acme', 'acme', 'library']);
    assert.deepEqual(body.chain, ['acme', 'builtin:clean']);
    assert.equal(body.effective.tokens.logo.main, join(sand.kits, 'acme', 'logo.png'));
    assert.deepEqual(body, (await get(`${base}/kit`)).body);
    const after = onDisk();
    assert.equal(after.kit, 'acme');
    const { kit: _chosen, ...rest } = after;
    assert.deepEqual({ ...rest, updatedAt: '' }, { ...before, updatedAt: '' });
    for (const choice of ['builtin:bold', 'bold']) {
      assert.equal((await put(`${base}/kit`, { choice })).body.choice, 'builtin:bold');
    }
    assert.equal((await put(`${base}/kit`, { choice: '' })).body.choice, 'builtin:clean');
    assert.equal(onDisk().kit, undefined);
    assert.equal(
      (await get(`/projects/${sand.project.id}`)).status,
      200,
      'the project routes still answer',
    );
  });

  it('refuses a choice that names no kit, and a body that says nothing', async () => {
    await put(`${base}/kit`, { choice: 'acme' });
    for (const choice of ['ghost', 'builtin:nope', 'project', '../acme', 7, {}]) {
      const { status, body } = await put(`${base}/kit`, { choice });
      assert.deepEqual([status, body.error, levels(body)], [422, 'No such kit', ['error choice']]);
    }
    assert.equal((await put(`${base}/kit`, {})).status, 400);
    assert.equal((await put(`${base}/kit`)).status, 400);
    assert.equal(onDisk().kit, 'acme');
  });

  it('writes the project’s own kit and chooses it', async () => {
    const kit = {
      name: 'Park look',
      extends: 'acme',
      tokens: { color: { accent: '#22c55e' } },
      hue: 3,
    };
    const { status, body } = await put(`${base}/kit`, { kit });
    assert.equal(status, 200);
    assert.deepEqual([body.choice, body.id, body.source], ['project', 'project', 'project']);
    assert.deepEqual(body.chain, ['project', 'acme', 'builtin:clean']);
    assert.deepEqual(levels(body), ['warning hue'], 'what was sent and not kept is said once');
    assert.deepEqual((await get(`${base}/kit`)).body.problems, []);
    const stored = JSON.parse(readFileSync(join(own, 'kit.json'), 'utf8'));
    assert.deepEqual([stored.id, stored.extends, stored.hue], ['project', 'acme', undefined]);
    assert.deepEqual(body.kit, stored);
    const { color, logo } = body.effective.tokens;
    assert.deepEqual([color.accent, color.primary], ['#22c55e', '#4f46e5']);
    assert.equal(logo.main, join(sand.kits, 'acme', 'logo.png'));
    assert.equal(onDisk().kit, 'project');
    await put(`${base}/kit`, { choice: 'builtin:playful' });
    assert.ok(existsSync(join(own, 'kit.json')), 'choosing another kit keeps the project’s own');
    assert.equal((await put(`${base}/kit`, { choice: 'project' })).body.choice, 'project');
  });

  it('refuses a kit that does not validate: nothing is written, nothing is chosen', async () => {
    await put(`${base}/kit`, { choice: 'acme' });
    const stored = readFileSync(join(own, 'kit.json'), 'utf8');
    const bad = [
      { extends: 'ghost' },
      { extends: 'project' },
      { tokens: { color: { text: 'white' } } },
      { tokens: { logo: { main: '../../../outside/secret.png' } } },
      'nothing',
    ];
    for (const kit of bad) {
      const { status, body } = await put(`${base}/kit`, { kit });
      assert.equal(status, 422, JSON.stringify(kit));
      assert.ok(body.problems.some((problem) => problem.level === 'error'));
    }
    assert.equal(readFileSync(join(own, 'kit.json'), 'utf8'), stored);
    assert.equal(onDisk().kit, 'acme');
    const large = await put(`${base}/kit`, { kit: { pad: 'x'.repeat(600 * 1024) } });
    assert.equal(large.status, 413);
  });

  it('falls back to builtin:clean when the chosen kit is gone, and says so', async () => {
    await put('/kits/passing', { kit: { name: 'Passing' } });
    await put(`${base}/kit`, { choice: 'passing' });
    await call(sand.url, 'DELETE', '/api/kits/passing');
    const { status, body } = await get(`${base}/kit`);
    assert.equal(status, 200);
    assert.deepEqual(
      [body.choice, body.id, body.chain],
      ['passing', 'builtin:clean', ['builtin:clean']],
    );
    assert.deepEqual(levels(body), ['error choice']);
    assert.equal(Object.keys(body.effective.elements).length, 9, 'the editor still has a kit');
  });

  it('lets an adaptation choose a kit of its own', async () => {
    const [main] = sand.project.adaptations;
    await put(`${base}/kit`, { choice: 'acme' });
    assert.equal((await get(`${base}/kit?adaptation=${main.id}`)).body.choice, 'acme');
    const chosen = await put(`${base}/kit?adaptation=${main.id}`, {
      choice: 'builtin:documentary',
    });
    assert.deepEqual([chosen.status, chosen.body.choice], [200, 'builtin:documentary']);
    assert.equal((await get(`${base}/kit`)).body.choice, 'acme');
    assert.equal(onDisk().adaptations[0].kit, 'builtin:documentary');
    assert.equal(
      (await get(`/projects/${sand.project.id}`)).body.adaptations[0].kit,
      'builtin:documentary',
    );
    const copy = { name: 'Vertical', aspectRatio: '9:16', copyFrom: main.id };
    const made = await call(sand.url, 'POST', `/api${base}/adaptations`, copy);
    assert.equal(made.body.kit, 'builtin:documentary', 'a copy keeps its source’s kit');
    assert.equal(
      (await get(`${base}/kit?adaptation=${made.body.id}`)).body.choice,
      'builtin:documentary',
    );
    await put(`${base}/kit?adaptation=${main.id}`, { choice: '' });
    assert.equal(onDisk().adaptations[0].kit, undefined);
    assert.equal((await get(`${base}/kit?adaptation=${main.id}`)).body.choice, 'acme');
  });
});

describe('PUT, DELETE /projects/:id/kit/files/:name', () => {
  it('keeps the project kit’s files in <project>/.nearedit/kit/, whatever kit is chosen', async () => {
    await put(`${base}/kit`, { choice: 'builtin:clean' });
    const sent = await send(sand.url, `/api${base}/kit/files/..%2F..%2Fmark.png`, PNG);
    assert.deepEqual([sent.status, sent.body], [200, { name: 'mark.png', size: PNG.length }]);
    assert.deepEqual(readdirSync(own).sort(), ['kit.json', 'mark.png']);
    assert.ok(!existsSync(join(sand.box.project, 'mark.png')));
    assert.deepEqual((await get(`${base}/kit`)).body.files, [
      { name: 'mark.png', size: PNG.length },
    ]);
    const kit = { extends: 'acme', tokens: { logo: { mark: 'mark.png' } } };
    const written = await put(`${base}/kit`, { kit });
    assert.deepEqual(written.body.problems, []);
    assert.equal(written.body.effective.tokens.logo.mark, join(own, 'mark.png'));
    assert.equal((await send(sand.url, `/api${base}/kit/files/x.svg`, '<svg/>')).status, 422);
    assert.equal(
      (await send(sand.url, `/api${base}/kit/files/big.ttf`, Buffer.alloc(11 << 20))).status,
      413,
    );
    assert.equal((await call(sand.url, 'DELETE', `/api${base}/kit/files/mark.png`)).status, 204);
    assert.equal((await call(sand.url, 'DELETE', `/api${base}/kit/files/mark.png`)).status, 404);
    assert.equal((await call(sand.url, 'DELETE', `/api${base}/kit/files/kit.json`)).status, 404);
    assert.deepEqual(levels((await get(`${base}/kit`)).body), ['warning tokens.logo.mark']);
  });
});

describe('kit files as media', () => {
  it('serves the files of the library and of a project’s kit, and a design made from them', async () => {
    await send(sand.url, `/api${base}/kit/files/mark.png`, PNG);
    const { effective } = (await get(`${base}/kit`)).body;
    const { main, mark } = effective.tokens.logo;
    for (const file of [main, mark]) {
      const res = await media(file);
      assert.deepEqual([res.status, res.headers['content-type']], [200, 'image/png'], file);
      assert.deepEqual(res.data, PNG);
    }
    const edl = insertElement(createEdl(), effective, 'bug', {}, { time: 0 });
    const { design } = edl.tracks.flatMap((track) => track.clips)[0].element;
    assert.ok(
      JSON.stringify(design).includes(JSON.stringify(mark).slice(1, -1)),
      'the design names the file',
    );
    assert.equal((await media(join(sand.box.outside, 'secret.txt'))).status, 403);
    assert.equal((await media(join(own, 'ghost.png'))).status, 404);
  });
});
