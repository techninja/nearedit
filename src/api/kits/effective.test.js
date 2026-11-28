import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { builtinKit, kitKey, resolveKit } from '#utils/brand/index.js';
import { effectiveKit } from './effective.js';
import { projectKit } from './project.js';
import { PNG, call, createKitSandbox } from './testkit.js';

let sand;
const errors = (found) => found.problems.filter((problem) => problem.level === 'error');
const paths = (found) => found.problems.map((problem) => `${problem.level} ${problem.path}`);
/** Move a file's mtime forward, as an edit would. */
const touch = (file, ms = 5000) => {
  const later = new Date(Date.now() + ms);
  utimesSync(file, later, later);
};
const ACME = {
  name: 'Acme',
  extends: 'builtin:bold',
  tokens: { color: { primary: '#4f46e5' }, logo: { main: 'logo.png' } },
  fonts: [{ family: 'Acme Sans', weight: 700, file: 'fonts/AcmeSans-Bold.woff2' }],
};

before(async () => {
  sand = await createKitSandbox('kit-effective');
  sand.write('acme', ACME, { 'logo.png': PNG, 'fonts/AcmeSans-Bold.woff2': 'font' });
});
after(() => sand?.close());

describe('effective kits: the chain', () => {
  it('resolves a built-in kit, and nothing chosen means builtin:clean', () => {
    const clean = effectiveKit('builtin:clean');
    assert.deepEqual(clean.chain, ['builtin:clean']);
    assert.equal(clean.source, 'builtin');
    assert.equal(clean.key, kitKey(resolveKit(builtinKit('clean'))));
    assert.deepEqual(clean.problems, []);
    for (const nothing of [undefined, null, '']) assert.equal(effectiveKit(nothing), clean);
    assert.equal(effectiveKit('builtin:bold').effective.tokens.color.primary, '#facc15');
  });

  it('resolves library → built-in, files as absolute paths inside the kit folder', () => {
    const acme = effectiveKit('acme');
    assert.deepEqual(acme.chain, ['acme', 'builtin:bold']);
    assert.deepEqual(
      [acme.ref, acme.source, acme.dir],
      ['acme', 'library', join(sand.kits, 'acme')],
    );
    assert.deepEqual(acme.problems, []);
    const { tokens, fonts, elements, id } = acme.effective;
    assert.equal(id, 'acme');
    assert.equal(tokens.color.primary, '#4f46e5');
    assert.equal(tokens.color.accent, '#ef4444', 'inherited from bold');
    assert.equal(tokens.logo.main, join(sand.kits, 'acme', 'logo.png'));
    assert.equal(fonts[0].file, join(sand.kits, 'acme', 'fonts', 'AcmeSans-Bold.woff2'));
    assert.equal(Object.keys(elements).length, 9);
    assert.equal(acme.key, kitKey(acme.effective));
    // As stored, the kit still names its files relative to its folder.
    assert.equal(acme.kit.tokens.logo.main, 'logo.png');
  });

  it('resolves project → library → built-in', () => {
    const own = {
      extends: 'acme',
      tokens: { color: { accent: '#22c55e' }, logo: { mark: 'm.png' } },
    };
    sand.write(join(sand.box.project, '.nearedit', 'kit'), own, { 'm.png': PNG });
    const found = effectiveKit('project', sand.box.project);
    assert.deepEqual(found.chain, ['project', 'acme', 'builtin:bold']);
    assert.deepEqual(found.problems, []);
    const { color, logo } = found.effective.tokens;
    assert.deepEqual([color.accent, color.primary], ['#22c55e', '#4f46e5']);
    assert.equal(logo.mark, join(sand.box.project, '.nearedit', 'kit', 'm.png'));
    assert.equal(logo.main, join(sand.kits, 'acme', 'logo.png'), 'each kit names its own folder');
    assert.equal(found.effective.id, 'project');
    assert.notEqual(found.key, effectiveKit('acme').key);
  });

  it('falls back to builtin:clean for a choice that is not there, and says so', () => {
    for (const choice of ['ghost', 'builtin:nope', 'project', '../acme', 42]) {
      const found = effectiveKit(
        choice,
        choice === 'project' ? join(sand.box.root, 'nowhere') : '',
      );
      assert.deepEqual(found.chain, ['builtin:clean'], String(choice));
      assert.deepEqual(paths(found), ['error choice']);
      assert.equal(found.effective, effectiveKit('builtin:clean').effective);
    }
  });

  it('cuts a chain at a missing parent', () => {
    sand.write('orphan', { extends: 'ghost', tokens: { color: { primary: '#ff0000' } } });
    const found = effectiveKit('orphan');
    assert.deepEqual(found.chain, ['orphan', 'builtin:clean']);
    assert.deepEqual(paths(found), ['error extends']);
    assert.match(found.problems[0].message, /"orphan" extends "ghost", which was not found/);
    assert.equal(found.effective.tokens.color.primary, '#ff0000', 'its own tokens still count');
    sand.write('rootless', { extends: 'builtin:nope' });
    assert.match(effectiveKit('rootless').problems[0].message, /extends "builtin:nope"/);
    sand.write('upward', { extends: 'project' });
    assert.deepEqual(paths(effectiveKit('upward')), ['error extends']);
  });

  it('cuts a loop, and a chain that is too long', () => {
    sand.write('loop-a', { extends: 'loop-b' });
    sand.write('loop-b', { extends: 'loop-a' });
    sand.write('self', { extends: 'self' });
    const loop = effectiveKit('loop-a');
    assert.deepEqual(loop.chain, ['loop-a', 'loop-b', 'builtin:clean']);
    assert.match(errors(loop)[0].message, /"loop-b" extends itself by way of "loop-a"/);
    assert.deepEqual(effectiveKit('self').chain, ['self', 'builtin:clean']);
    for (let i = 1; i <= 6; i++) sand.write(`deep-${i}`, { extends: i < 6 ? `deep-${i + 1}` : '' });
    const deep = effectiveKit('deep-1');
    assert.deepEqual(deep.chain, ['deep-1', 'deep-2', 'deep-3', 'deep-4', 'builtin:clean']);
    assert.match(errors(deep)[0].message, /more than 5 kits/);
    assert.deepEqual(effectiveKit('deep-3').problems, [], 'four kits and a built-in are fine');
  });
});

describe('effective kits: files', () => {
  it('never hands out a path outside the kit folder', () => {
    writeFileSync(join(sand.box.outside, 'secret.png'), PNG);
    const dir = sand.write('hostile', {
      tokens: {
        logo: { main: '../../../outside/secret.png', mark: join(sand.box.outside, 'secret.png') },
      },
      fonts: [
        { family: 'Up', file: '../acme/fonts/AcmeSans-Bold.woff2' },
        { family: 'Linked', file: 'linked.woff2' },
        { family: 'Deep', file: 'sub/deep.woff2' },
        { family: 'Gone', file: 'gone.ttf' },
      ],
    });
    symlinkSync(join(sand.box.outside, 'secret.txt'), join(dir, 'linked.woff2'));
    symlinkSync(sand.box.outside, join(dir, 'sub'));
    writeFileSync(join(sand.box.outside, 'deep.woff2'), 'font');
    const found = effectiveKit('hostile');
    assert.deepEqual(found.effective.tokens.logo, { main: '', mark: '', initials: '' });
    assert.deepEqual(
      found.effective.fonts.map((face) => [face.family, face.file]),
      [['Gone', join(dir, 'gone.ttf')]],
      'a file that is merely not there yet keeps its place',
    );
    assert.deepEqual(paths(found).slice(0, 6), [
      'error tokens.logo.main',
      'error tokens.logo.mark',
      'error fonts[0].file',
      'error fonts[1].file',
      'error fonts[2].file',
      'warning fonts[3].file',
    ]);
    assert.match(found.problems[0].message, /leaves the kit folder/);
    assert.match(found.problems[1].message, /must be a path relative to the kit folder/);
    assert.match(found.problems[3].message, /is a link that leaves the kit folder/);
    assert.ok(!JSON.stringify(found.effective).includes('outside'));
  });

  it('a kit folder that is a link, or without kit.json, is not a kit', () => {
    const real = sand.write(join(sand.box.outside, 'elsewhere'), { name: 'Elsewhere' });
    symlinkSync(real, join(sand.kits, 'linked'));
    mkdirSync(join(sand.kits, 'empty'));
    for (const id of ['linked', 'empty'])
      assert.deepEqual(paths(effectiveKit(id)), ['error choice']);
  });
});

describe('effective kits: never stale', () => {
  it('gives the same object until something it read changes', async () => {
    const dir = sand.write('live', { extends: 'acme', tokens: { logo: { mark: 'mark.png' } } });
    const first = effectiveKit('live');
    assert.equal(effectiveKit('live'), first);
    assert.equal(effectiveKit('live').effective, first.effective);
    assert.deepEqual(paths(first), ['warning tokens.logo.mark']);

    writeFileSync(join(dir, 'mark.png'), PNG); // the file arrives
    const second = effectiveKit('live');
    assert.notEqual(second, first);
    assert.deepEqual(second.problems, []);
    assert.equal(second.key, first.key, 'the same paths: the same key');

    sand.write('live', { extends: 'acme', tokens: { color: { text: '#fefefe' } } });
    touch(join(dir, 'kit.json'));
    const third = effectiveKit('live');
    assert.equal(third.effective.tokens.color.text, '#fefefe');
    assert.notEqual(third.key, second.key);

    sand.write('acme', { ...ACME, tokens: { color: { primary: '#000001' } } }); // a parent changes
    touch(join(sand.kits, 'acme', 'kit.json'));
    assert.equal(effectiveKit('live').effective.tokens.color.primary, '#000001');
    sand.write('acme', ACME);
    touch(join(sand.kits, 'acme', 'kit.json'), 9000);

    rmSync(dir, { recursive: true });
    assert.deepEqual(paths(effectiveKit('live')), ['error choice']);
  });

  it('projectKit follows the project file: its choice, and an adaptation’s own', async () => {
    const { project, url } = sand;
    const [main] = project.adaptations;
    assert.equal(projectKit(project.id).choice, 'builtin:clean');
    await call(url, 'PUT', `/api/projects/${project.id}/kit`, { choice: 'acme' });
    const chosen = projectKit(project.id);
    assert.deepEqual([chosen.choice, chosen.chain], ['acme', ['acme', 'builtin:bold']]);
    assert.equal(chosen.effective, effectiveKit('acme').effective, 'one object for one kit');
    assert.equal(
      projectKit(project.id, main.id).choice,
      'acme',
      'an adaptation goes with the project',
    );
    await call(url, 'PUT', `/api/projects/${project.id}/kit?adaptation=${main.id}`, {
      choice: 'builtin:playful',
    });
    assert.equal(projectKit(project.id, main.id).choice, 'builtin:playful');
    assert.equal(projectKit(project.id).choice, 'acme');
    assert.throws(() => projectKit('nobody'), { status: 404 });
    assert.throws(() => projectKit(project.id, 'nothing'), { status: 404 });
  });
});
