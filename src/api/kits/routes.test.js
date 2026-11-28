import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { MAX_KIT_JSON } from './limits.js';
import { PNG, call, createKitSandbox, send } from './testkit.js';

let sand;
const get = (path) => call(sand.url, 'GET', `/api${path}`);
const put = (path, body) => call(sand.url, 'PUT', `/api${path}`, body);
const del = (path) => call(sand.url, 'DELETE', `/api${path}`);
const stored = (id) => JSON.parse(readFileSync(join(sand.kits, id, 'kit.json'), 'utf8'));
const ACME = {
  name: 'Acme',
  description: 'Indigo and amber',
  extends: 'builtin:clean',
  tokens: { color: { primary: '#4f46e5' }, logo: { main: 'logo.png' } },
};

before(async () => {
  sand = await createKitSandbox('kit-routes');
});
after(() => sand?.close());

describe('GET /kits', () => {
  it('lists the built-in kits before there is a library', async () => {
    const { status, body } = await get('/kits');
    assert.equal(status, 200);
    assert.deepEqual(
      body.kits.map((kit) => [kit.id, kit.source, kit.elements, kit.problems, kit.extends]),
      ['clean', 'bold', 'documentary', 'playful'].map((n) => [`builtin:${n}`, 'builtin', 9, 0, '']),
    );
    const [clean] = body.kits;
    assert.deepEqual(Object.keys(clean), [
      ...[
        'id',
        'name',
        'description',
        'source',
        'extends',
        'key',
        'colors',
        'elements',
        'problems',
      ],
    ]);
    assert.deepEqual(Object.keys(clean.colors), [
      'background',
      'surface',
      'primary',
      'accent',
      'text',
    ]);
    assert.match(clean.key, /^[0-9a-f]{20}$/);
    assert.ok(clean.description.length > 10);
  });

  it('lists library kits by name, a broken one with its problems rather than breaking', async () => {
    sand.write('zed', { name: 'Zed', extends: 'builtin:bold' });
    sand.write('broken', '{ "name": "Broken", ');
    sand.write('orphan', { name: 'Orphan', extends: 'ghost' });
    sand.write('loop-a', { name: 'Loop', extends: 'loop-b' });
    sand.write('loop-b', { name: 'Loop', extends: 'loop-a' });
    sand.write('huge', `{ "name": "${'x'.repeat(MAX_KIT_JSON)}" }`);
    sand.write('clean', { name: 'Shadow' }); // a reserved name is not a kit of the library
    sand.write('not an id', { name: 'Spaces' });
    symlinkSync(join(sand.kits, 'zed'), join(sand.kits, 'linked'));
    writeFileSync(join(sand.kits, 'stray.txt'), 'not a folder');
    const { body } = await get('/kits');
    const library = body.kits.filter((kit) => kit.source === 'library');
    assert.deepEqual(
      library.map((kit) => [kit.id, kit.name, kit.problems > 0]),
      [
        ...[
          ['broken', 'broken', true],
          ['huge', 'huge', true],
        ],
        ...[
          ['loop-a', 'Loop', true],
          ['loop-b', 'Loop', true],
        ],
        ...[
          ['orphan', 'Orphan', true],
          ['zed', 'Zed', false],
        ],
      ],
    );
    assert.equal(library.at(-1).colors.primary, '#facc15', 'the colours are the effective ones');
    assert.equal(library.find((kit) => kit.id === 'orphan').extends, 'ghost');
    const broken = await get('/kits/broken');
    assert.equal(broken.status, 200);
    assert.match(broken.body.problems[0].message, /kit\.json cannot be read/);
    assert.match((await get('/kits/huge')).body.problems[0].message, /larger than 512 KB/);
    assert.deepEqual(broken.body.chain, ['broken', 'builtin:clean']);
  });
});

describe('GET /kits/:id', () => {
  it('reads a built-in kit like any other', async () => {
    for (const id of ['builtin%3Abold', 'builtin:bold', 'bold']) {
      const { status, body } = await get(`/kits/${id}`);
      assert.equal(status, 200, id);
      assert.deepEqual(Object.keys(body), [
        ...['id', 'source', 'kit', 'effective', 'key', 'chain', 'files', 'problems'],
      ]);
      assert.deepEqual(
        [body.id, body.source, body.chain],
        ['builtin:bold', 'builtin', ['builtin:bold']],
      );
      assert.deepEqual([body.files, body.problems, body.kit.id], [[], [], 'bold']);
      assert.equal(Object.keys(body.effective.elements).length, 9);
    }
  });

  it('answers 404 for a kit that is not there and for names that cannot be one', async () => {
    for (const id of ['ghost', 'builtin%3Anope', 'project', '..%2Facme', 'a%2Fb', 'linked']) {
      const res = await get(`/kits/${id}`);
      assert.deepEqual([res.status, res.body.error], [404, 'Kit not found'], id);
    }
    // A client resolves dot segments itself: such a request never reaches a kit route.
    assert.equal((await get('/kits/%2e%2e/%2e%2e/registry.json')).status, 404);
  });
});

describe('PUT /kits/:id', () => {
  it('creates a kit, stores what the model keeps of it, and answers as GET', async () => {
    const sent = {
      ...ACME,
      id: 'something-else',
      note: 'mine',
      tokens: { ...ACME.tokens, wobble: {} },
    };
    const { status, body } = await put('/kits/acme', { kit: sent });
    assert.equal(status, 200);
    assert.deepEqual(
      [body.id, body.source, body.chain],
      ['acme', 'library', ['acme', 'builtin:clean']],
    );
    assert.deepEqual(stored('acme'), {
      ...{ id: 'acme', name: 'Acme', description: 'Indigo and amber', extends: 'builtin:clean' },
      ...{ tokens: ACME.tokens, fonts: [], elements: {}, defaults: {} },
    });
    assert.deepEqual(body.kit, stored('acme'));
    assert.equal(body.effective.tokens.logo.main, join(sand.kits, 'acme', 'logo.png'));
    // What was sent and not kept, and the logo that is not there yet: warnings, not refusals.
    assert.deepEqual(
      body.problems.map((p) => `${p.level} ${p.path}`),
      [...['warning note', 'warning tokens.wobble', 'warning id'], 'warning tokens.logo.main'],
    );
    const again = await get('/kits/acme');
    assert.deepEqual(
      again.body.problems.map((p) => p.path),
      ['tokens.logo.main'],
    );
    assert.deepEqual({ ...again.body, problems: [] }, { ...body, problems: [] });
    assert.deepEqual(readdirSync(join(sand.kits, 'acme')), ['kit.json'], 'no part file is left');
  });

  it('replaces a kit, and a kit may extend another kit of the library', async () => {
    const child = await put('/kits/acme-dark', {
      kit: { extends: 'acme', tokens: { color: { text: '#eeeeee' } } },
    });
    assert.deepEqual(child.body.chain, ['acme-dark', 'acme', 'builtin:clean']);
    assert.equal(child.body.effective.tokens.color.primary, '#4f46e5');
    const before = child.body.key;
    await put('/kits/acme', { kit: { ...ACME, tokens: { color: { primary: '#111111' } } } });
    const after = await get('/kits/acme-dark');
    assert.equal(after.body.effective.tokens.color.primary, '#111111');
    assert.notEqual(after.body.key, before, 'a parent changed: the key moved');
    await put('/kits/acme', { kit: ACME });
  });

  it('refuses a kit that does not validate with 422 and every problem, and stores nothing', async () => {
    const cases = [
      [{ tokens: { color: { primary: 'blue' } } }, 'tokens.color.primary'],
      [{ fonts: [{ family: 'Inter', file: 'i.ttf' }] }, 'fonts[0]'],
      [{ extends: 'not a kit!' }, 'extends'],
      [{ extends: 'ghost' }, 'extends'],
      [{ extends: 'builtin:nope' }, 'extends'],
      [{ extends: 'fresh' }, 'extends'],
      [{ tokens: { logo: { main: '../acme/logo.png' } } }, 'tokens.logo.main'],
      [{ tokens: { logo: { main: '/etc/hostname.png' } } }, 'tokens.logo.main'],
      [
        { elements: { card: { kind: 'overlay', layers: [{ type: 'hologram' }] } } },
        'elements.card',
      ],
      ['a string', ''],
      [undefined, ''],
      [[], ''],
    ];
    for (const [kit, path] of cases) {
      const { status, body } = await put('/kits/fresh', { kit });
      assert.equal(status, 422, JSON.stringify(kit));
      assert.equal(body.error, 'The kit does not validate');
      const errors = body.problems.filter((problem) => problem.level === 'error');
      assert.ok(
        errors.some((problem) => problem.path.startsWith(path)),
        JSON.stringify(body.problems),
      );
      assert.ok(body.detail);
    }
    assert.ok(!existsSync(join(sand.kits, 'fresh')));
    await put('/kits/acme-dark', { kit: { extends: 'acme' } });
    const loop = await put('/kits/acme', { kit: { ...ACME, extends: 'acme-dark' } });
    assert.equal(loop.status, 422);
    assert.match(loop.body.problems.find((p) => p.path === 'extends').message, /extends itself/);
    assert.equal(stored('acme').extends, 'builtin:clean', 'the stored kit is untouched');
  });

  it('refuses built-in kits, reserved and unusable ids, and a kit that is too large', async () => {
    for (const id of ['builtin%3Aclean', 'clean', 'builtin%3Anope']) {
      const res = await put(`/kits/${id}`, { kit: ACME });
      assert.deepEqual([res.status, res.body.error], [403, 'Built-in kits cannot be changed'], id);
    }
    for (const id of ['project', 'a%20b', '..%2Fup', '-x', 'x'.repeat(41)]) {
      const res = await put(`/kits/${id}`, { kit: ACME });
      assert.deepEqual([res.status, res.body.problems[0].path], [422, 'id'], id);
    }
    const large = await put('/kits/large', {
      kit: { name: 'Large', pad: 'x'.repeat(MAX_KIT_JSON) },
    });
    assert.deepEqual([large.status, large.body.error], [413, 'A kit.json may be at most 512 KB']);
    assert.ok(!existsSync(join(sand.kits, 'large')));
    const trimmed = await put('/kits/trimmed', { kit: { name: 'x'.repeat(5000) } });
    assert.equal(trimmed.status, 200, 'a long name is cut, not refused');
    assert.equal(stored('trimmed').name.length, 80);
    assert.deepEqual(
      readdirSync(sand.kits).filter((name) => name.includes('..')),
      [],
    );
  });
});

describe('DELETE /kits/:id', () => {
  it('removes a library kit with its files, and only a library kit', async () => {
    await put('/kits/doomed', { kit: { name: 'Doomed' } });
    await send(sand.url, '/api/kits/doomed/files/logo.png', PNG);
    assert.equal((await del('/kits/doomed')).status, 204);
    assert.ok(!existsSync(join(sand.kits, 'doomed')));
    assert.equal((await del('/kits/doomed')).status, 404);
    assert.equal((await del('/kits/builtin%3Aclean')).status, 403);
    assert.equal((await del('/kits/..%2F..%2Fhome')).status, 404);
    assert.equal((await del('/kits/linked')).status, 404);
    assert.ok(
      existsSync(join(sand.kits, 'zed', 'kit.json')),
      'a linked folder’s target is untouched',
    );
    assert.ok(existsSync(sand.box.project));
  });

  it('leaves kits that extended it listed, with a problem', async () => {
    await put('/kits/base', { kit: { name: 'Base' } });
    await put('/kits/child', { kit: { name: 'Child', extends: 'base' } });
    assert.equal((await del('/kits/base')).status, 204);
    const child = await get('/kits/child');
    assert.deepEqual(child.body.chain, ['child', 'builtin:clean']);
    assert.deepEqual(
      child.body.problems.map((p) => `${p.level} ${p.path}`),
      ['error extends'],
    );
    const listed = (await get('/kits')).body.kits.find((kit) => kit.id === 'child');
    assert.equal(listed.problems, 1);
  });
});
