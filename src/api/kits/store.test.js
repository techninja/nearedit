import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, symlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { rawGet } from '../../../tests/server/http.js';
import { kitKey } from '#utils/brand/index.js';
import { effectiveKit } from './effective.js';
import { InvalidKit } from './errors.js';
import { readKit, readKitFolder } from './folder.js';
import { getKit, listKits, putKit } from './library.js';
import { MAX_KIT_JSON } from './limits.js';
import { parseRef } from './names.js';
import { writeKit } from './store.js';
import { PNG, call, createKitSandbox, send } from './testkit.js';

let sand;
const touch = (file) => {
  const later = new Date(Date.now() + 5000);
  utimesSync(file, later, later);
};

before(async () => {
  sand = await createKitSandbox('kit-store');
});
after(() => sand?.close());

describe('reading a kit', () => {
  it('keeps what the model keeps, under the id it is known by', () => {
    const raw = {
      ...{
        id: 'other',
        name: 'N'.repeat(200),
        description: 'd'.repeat(900),
        extends: 'builtin:bold',
      },
      tokens: { color: { primary: '#ABCDEF', nonsense: 1 }, extra: {} },
      fonts: [{ family: 'Mine', file: 'm.woff2' }, { family: 'Bad' }],
      junk: true,
    };
    const { kit, problems, named } = readKit(raw, 'acme');
    assert.deepEqual(Object.keys(kit), [
      ...['id', 'name', 'description', 'extends', 'tokens', 'fonts', 'elements', 'defaults'],
    ]);
    assert.deepEqual(
      [kit.id, named, kit.name.length, kit.description.length],
      ['acme', 'other', 80, 400],
    );
    assert.deepEqual(kit.tokens, { color: { primary: '#abcdef' } });
    assert.deepEqual(kit.fonts, [
      { family: 'Mine', weight: 400, style: 'normal', file: 'm.woff2' },
    ]);
    assert.deepEqual(problems.map((problem) => `${problem.level} ${problem.path}`).sort(), [
      ...['error fonts[1]', 'warning id', 'warning junk', 'warning name'],
      ...['warning tokens.color.nonsense', 'warning tokens.extra'],
    ]);
    for (const garbage of [null, 'text', 7, [], undefined]) {
      const read = readKit(garbage, 'x');
      assert.deepEqual([read.kit.id, read.named, read.problems[0].level], ['x', '', 'error']);
      assert.deepEqual(read.kit.tokens, {});
    }
  });

  it('reads a folder once, and again only when kit.json changed', () => {
    const dir = sand.write('cached', { name: 'One' });
    const first = readKitFolder(dir, 'cached');
    assert.equal(readKitFolder(dir, 'cached'), first);
    assert.deepEqual([first.kit.name, first.refs, first.problems], ['One', [], []]);
    sand.write('cached', { name: 'Two', tokens: { logo: { main: 'a.png' } } });
    touch(join(dir, 'kit.json'));
    const second = readKitFolder(dir, 'cached');
    assert.deepEqual([second.kit.name, second.refs], ['Two', ['a.png']]);
    assert.equal(readKitFolder(join(sand.kits, 'nowhere'), 'nowhere'), null);
    symlinkSync(dir, join(sand.kits, 'alias'));
    assert.equal(
      readKitFolder(join(sand.kits, 'alias'), 'alias'),
      null,
      'a linked folder is not a kit',
    );
  });
});

describe('writing a kit', () => {
  it('stores it whole, as the model reads it, ending in a newline', () => {
    const dir = join(sand.kits, 'written');
    const sent = { name: 'Written', tokens: { color: { accent: '#00FF00' } }, loose: [1, 2, 3] };
    const candidate = writeKit(parseRef('written'), dir, sent);
    assert.deepEqual(
      candidate.problems.map((p) => `${p.level} ${p.path}`),
      ['warning loose'],
    );
    const text = readFileSync(join(dir, 'kit.json'), 'utf8');
    assert.ok(text.endsWith('}\n') && text.includes('\n  "tokens"'), 'pretty-printed');
    assert.deepEqual(JSON.parse(text), readKitFolder(dir, 'written').kit);
    assert.equal(JSON.parse(text).tokens.color.accent, '#00ff00');
    assert.deepEqual(readdirSync(dir), ['kit.json']);
    assert.deepEqual(getKit('written').problems, []);
  });

  it('writes nothing when the kit has an error', () => {
    const dir = join(sand.kits, 'refused');
    for (const kit of [{ tokens: { color: { text: 'red' } } }, { extends: 'ghost' }, null]) {
      assert.throws(
        () => writeKit(parseRef('refused'), dir, kit),
        (err) => {
          assert.ok(err instanceof InvalidKit);
          assert.equal(err.status, 422);
          assert.ok(err.problems.some((problem) => problem.level === 'error'));
          return true;
        },
      );
    }
    assert.ok(!existsSync(dir));
    assert.throws(() => putKit('project', {}), InvalidKit);
    assert.throws(() => putKit('builtin:clean', {}), { status: 403 });
  });

  it('keeps kit.json under its limit: compact when pretty is too large, refused beyond', () => {
    const text = 't'.repeat(120);
    const layers = Array.from({ length: 48 }, (_, i) => ({
      id: `l${i}`,
      type: 'text',
      text,
      size: 4,
    }));
    const element = { label: 'Card', kind: 'overlay', slots: {}, layers };
    const elements = Object.fromEntries(Array.from({ length: 56 }, (_, i) => [`e${i}`, element]));
    const kit = readKit({ elements }, 'dense').kit;
    const [compact, pretty] = [JSON.stringify(kit), JSON.stringify(kit, null, 2)].map(
      Buffer.byteLength,
    );
    assert.ok(
      compact < MAX_KIT_JSON && pretty > MAX_KIT_JSON,
      `${compact} < ${MAX_KIT_JSON} < ${pretty}`,
    );
    const dir = join(sand.kits, 'dense');
    writeKit(parseRef('dense'), dir, { elements });
    assert.equal(
      readFileSync(join(dir, 'kit.json'), 'utf8').includes('\n'),
      false,
      'stored compact',
    );
    const read = getKit('dense');
    assert.deepEqual(
      read.problems.filter((problem) => problem.level === 'error'),
      [],
    );
    assert.equal(Object.keys(read.kit.elements).length, 56);
    assert.throws(
      () => writeKit(parseRef('fat'), join(sand.kits, 'fat'), { pad: 'x'.repeat(MAX_KIT_JSON) }),
      {
        status: 413,
      },
    );
    assert.ok(!existsSync(join(sand.kits, 'fat')));
  });
});

describe('the library', () => {
  it('lists built-in kits first, then its own by name', () => {
    putKit('beta', { name: 'alpha' });
    putKit('alpha', { name: 'Beta' });
    const ids = listKits().map((kit) => kit.id);
    assert.deepEqual(ids.slice(0, 4), [
      'builtin:clean',
      'builtin:bold',
      'builtin:documentary',
      'builtin:playful',
    ]);
    assert.deepEqual(
      ids.filter((id) => ['alpha', 'beta'].includes(id)),
      ['beta', 'alpha'],
    );
  });

  it('gives a key the editor computes the same from the JSON it receives', async () => {
    putKit('wire', {
      name: 'Wire',
      tokens: { logo: { main: 'logo.png' } },
      fonts: [{ family: 'W', file: 'w.ttf' }],
    });
    const { body } = await call(sand.url, 'GET', '/api/kits/wire');
    assert.equal(kitKey(body.effective), body.key);
    assert.equal(body.key, effectiveKit('wire').key);
    for (const kit of (await call(sand.url, 'GET', '/api/kits')).body.kits) {
      const one = await call(sand.url, 'GET', `/api/kits/${encodeURIComponent(kit.id)}`);
      assert.equal(kitKey(one.body.effective), kit.key, kit.id);
    }
  });

  it('may live outside the data directory (NEAREDIT_KITS_DIR), and its files are media', async () => {
    const shared = join(sand.box.root, 'shared-kits');
    process.env.NEAREDIT_KITS_DIR = shared;
    try {
      assert.deepEqual(
        listKits().filter((kit) => kit.source === 'library'),
        [],
      );
      assert.equal(
        (await call(sand.url, 'PUT', '/api/kits/team', { kit: { name: 'Team' } })).status,
        200,
      );
      assert.equal((await send(sand.url, '/api/kits/team/files/logo.png', PNG)).status, 200);
      const file = join(shared, 'team', 'logo.png');
      assert.ok(existsSync(file));
      const served = await rawGet(`${sand.url}/api/media/file?path=${encodeURIComponent(file)}`);
      assert.deepEqual([served.status, served.headers['content-type']], [200, 'image/png']);
      const secret = join(sand.box.outside, 'secret.txt');
      assert.equal(
        (await rawGet(`${sand.url}/api/media/file?path=${encodeURIComponent(secret)}`)).status,
        403,
      );
    } finally {
      delete process.env.NEAREDIT_KITS_DIR;
    }
    assert.ok(
      listKits().some((kit) => kit.id === 'wire'),
      'back in the data directory',
    );
  });
});
