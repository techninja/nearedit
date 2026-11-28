import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { builtinKit, resolveKit } from '#utils/brand/index.js';
import { createEdl, insertElement } from '#utils/edl/index.js';
import { createFixture } from './testkit.js';

const FONT = fileURLToPath(
  new URL(
    '../../node_modules/@fontsource/caveat/files/caveat-latin-700-normal.woff2',
    import.meta.url,
  ),
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const CLEAN = resolveKit(builtinKit('clean'));
let fx;
let acme;

/** A kit folder, written by hand. */
const kitFolder = (dir, kit, files = {}) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'kit.json'), JSON.stringify(kit));
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    if (typeof source === 'string') copyFileSync(source, join(dir, name));
    else writeFileSync(join(dir, name), source);
  }
  return dir;
};
/** A timeline with element clips from the clean kit: 2 lower thirds, a title, an intro. */
const timeline = () => {
  let edl = createEdl({ resolution: '640x360' });
  edl = insertElement(edl, CLEAN, 'intro', { title: 'Engines' }, { time: 0, duration: 2 });
  edl = insertElement(
    edl,
    CLEAN,
    'lower-third',
    { name: 'Ada', role: 'Maths' },
    { time: 2, duration: 3 },
  );
  edl = insertElement(edl, CLEAN, 'title', { title: 'Notes' }, { time: 5, duration: 3 });
  edl = insertElement(edl, CLEAN, 'lower-third', { name: 'Charles' }, { time: 8, duration: 2 });
  return JSON.parse(JSON.stringify(edl));
};
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const elements = (doc) => doc.tracks.flatMap((track) => track.clips).filter((clip) => clip.element);
const outside = (doc) =>
  doc.tracks.map((track) => ({ ...track, clips: track.clips.map(({ element, ...rest }) => rest) }));

before(() => {
  fx = createFixture();
  kitFolder(
    join(fx.project, 'brand', 'house'),
    {
      ...{ id: 'house', name: 'House', extends: 'builtin:bold' },
      tokens: { color: { primary: '#e11d48' }, logo: { mark: 'mark.png' } },
    },
    { 'mark.png': PNG },
  );
  acme = kitFolder(
    join(fx.project, 'brand', 'acme'),
    {
      ...{ id: 'acme', name: 'Acme', extends: 'house' },
      tokens: {
        font: { heading: { family: 'Acme Hand', weight: 700 } },
        color: { accent: '#22c55e' },
      },
      fonts: [{ family: 'Acme Hand', weight: 700, file: 'fonts/hand.woff2' }],
    },
    { 'fonts/hand.woff2': FONT },
  );
});
after(() => fx?.remove());

describe('nearedit restyle', () => {
  it('gives every element clip the kit’s design and keeps everything else', () => {
    const before = timeline();
    const file = fx.save('talk.json', before);
    const dry = fx.cli('restyle', file, '--kit', acme, '--dry-run');
    assert.equal(dry.code, 0, dry.err);
    assert.equal(dry.out.trim(), `${file}: 1 intro, 2 lower-third, 1 title: would be updated`);
    assert.deepEqual(read(file), before, 'a dry run writes nothing');

    const done = fx.cli('restyle', file, '--kit', acme);
    assert.deepEqual([done.code, done.err], [0, '']);
    assert.equal(done.out.trim(), `${file}: 1 intro, 2 lower-third, 1 title: updated`);
    const now = read(file);
    assert.deepEqual(outside(now), outside(before), 'place, length, fades, transform: untouched');
    for (const [i, clip] of elements(now).entries()) {
      const was = elements(before)[i].element;
      assert.equal(clip.element.kit.id, 'acme');
      assert.match(clip.element.kit.key, /^[0-9a-f]{20}$/);
      assert.notEqual(clip.element.kit.key, was.kit.key);
      assert.deepEqual([clip.element.id, clip.element.slots], [was.id, was.slots]);
      assert.notDeepEqual(clip.element.design, was.design);
    }
    // A kit inside the document's folder is named relative to it: the two travel together.
    assert.deepEqual(now.fonts, [
      { family: 'Acme Hand', weight: 700, style: 'normal', file: 'brand/acme/fonts/hand.woff2' },
    ]);
    assert.ok(
      JSON.stringify(now).includes('"brand/house/mark.png"'),
      'the logo of the kit it extends',
    );
    assert.ok(!JSON.stringify(now).includes(fx.root), 'no absolute path');
    assert.ok(JSON.stringify(now).includes('#e11d48'), 'tokens come down the chain');

    const again = fx.cli('restyle', file, '--kit', acme);
    assert.equal(again.out.trim(), `${file}: 4 already current`);
    assert.deepEqual(read(file), now);
    const valid = fx.cli('validate', file);
    assert.equal(valid.code, 0, valid.out);
    const frame = fx.cli('frame', file, '--time', '3.5', '-o', join(fx.project, 'after.png'));
    assert.equal(frame.code, 0, frame.err);
  });

  it('restyles only the elements named, and can write elsewhere', () => {
    const before = timeline();
    const file = fx.save('only.json', before);
    const out = join(fx.project, 'only.out.json');
    const done = fx.cli(
      'restyle',
      file,
      '-k',
      'builtin:playful',
      '--only',
      'lower-third,title',
      '-o',
      out,
    );
    assert.equal(done.code, 0, done.err);
    assert.equal(done.out.trim(), `${out}: 2 lower-third, 1 title: updated; 1 left out by --only`);
    assert.deepEqual(read(file), before, 'the original is untouched');
    assert.deepEqual(
      elements(read(out))
        .map((clip) => `${clip.element.id}:${clip.element.kit.id}`)
        .sort(),
      ['intro:clean', 'lower-third:playful', 'lower-third:playful', 'title:playful'],
    );
    assert.equal(read(out).fonts, undefined);
    const typo = fx.cli('restyle', file, '--kit', 'builtin:bold', '--only', 'lower-thrid');
    assert.equal(typo.code, 2);
    assert.match(
      typo.err,
      /--only lower-thrid: the kit has no such element\. It has: lower-third, title/,
    );
  });

  it('leaves clips of an element the kit does not have, and restyles locked tracks too', () => {
    const doc = timeline();
    elements(doc)[0].element.id = 'ticker';
    for (const track of doc.tracks) track.locked = true;
    const file = fx.save('odd.json', doc);
    const done = fx.cli('restyle', file, '--kit', 'builtin:bold');
    assert.match(
      done.out,
      /: 2 lower-third, 1 title: updated; 1 ticker: not in the kit, left as they are\n$/,
    );
    assert.deepEqual(
      elements(read(file))
        .map((clip) => `${clip.element.id}:${clip.element.kit.id}`)
        .sort(),
      ['lower-third:bold', 'lower-third:bold', 'ticker:clean', 'title:bold'],
    );
    assert.ok(read(file).tracks.every((track) => track.locked === true));
    const plain = fx.save('plain.json', { tracks: [{ type: 'video', clips: [] }] });
    assert.equal(
      fx.cli('restyle', plain, '--kit', 'builtin:bold').out.trim(),
      `${plain}: no element clips`,
    );
    const bare = fx.save('bare.json', timeline().tracks);
    assert.match(
      fx.cli('restyle', bare, '--kit', 'builtin:bold').out,
      /: 1 intro, 2 lower-third, 1 title: updated/,
    );
    assert.ok(Array.isArray(read(bare)), 'a bare list of tracks stays one');
  });

  it('restyles every timeline of a folder and passes over what is not one', () => {
    const dir = join(fx.project, 'series');
    const kit = kitFolder(
      join(dir, 'brand'),
      {
        ...{ id: 'series', extends: 'builtin:documentary' },
        fonts: [{ family: 'Series Hand', weight: 700, file: 'hand.woff2' }],
        tokens: { font: { heading: { family: 'Series Hand', weight: 700 } } },
      },
      { 'hand.woff2': FONT },
    );
    for (const name of ['ep1.json', 'ep2.json'])
      writeFileSync(join(dir, name), JSON.stringify(timeline()));
    writeFileSync(join(dir, 'song.json'), JSON.stringify({ tempo: 120, parts: [] }));
    writeFileSync(join(dir, 'notes.txt'), 'not json');
    const done = fx.cli('restyle', dir, '--kit', kit);
    assert.deepEqual([done.code, done.err], [0, '']);
    assert.deepEqual(done.out.trim().split('\n'), [
      `${join(dir, 'ep1.json')}: 1 intro, 2 lower-third, 1 title: updated`,
      `${join(dir, 'ep2.json')}: 1 intro, 2 lower-third, 1 title: updated`,
      `${dir}: 2 timelines, 2 changed`,
    ]);
    assert.equal(read(join(dir, 'ep2.json')).fonts[0].file, 'brand/hand.woff2');
    assert.deepEqual(read(join(dir, 'song.json')), { tempo: 120, parts: [] });
    writeFileSync(join(dir, 'broken.json'), '{ "tracks": [');
    const again = fx.cli('restyle', dir, '--kit', kit);
    assert.equal(again.code, 1);
    assert.match(again.err, /broken\.json is not valid JSON/);
    assert.match(again.out, /2 timelines, 0 changed/);
    assert.equal(fx.cli('restyle', dir, '--kit', kit, '-o', 'x.json').code, 2);
    assert.deepEqual(
      readdirSync(dir).filter((name) => name.includes('.part')),
      [],
    );
  });

  it('names a kit outside the document’s folder by its path, and says how to render', () => {
    const away = kitFolder(
      join(fx.library, 'brand'),
      {
        ...{ name: 'Away', tokens: { logo: { mark: 'logo.png' } } },
      },
      { 'logo.png': PNG },
    );
    const file = fx.save('away.json', timeline());
    const done = fx.cli('restyle', file, '--kit', away);
    assert.equal(done.code, 0);
    assert.match(
      done.err,
      /The kit's files lie outside the timeline's folder: render with --media .*brand/,
    );
    assert.ok(JSON.stringify(read(file)).includes(JSON.stringify(join(away, 'logo.png'))));
    assert.equal(fx.cli('validate', file).code, 1, 'outside the document’s folder');
    assert.equal(fx.cli('validate', file, '--media', away).code, 0);
  });

  it('exits 1 and changes nothing when the kit does not validate', () => {
    const before = timeline();
    const file = fx.save('kept.json', before);
    const bad = kitFolder(join(fx.project, 'brand', 'bad'), {
      ...{ extends: 'nobody', tokens: { color: { text: 'white' } } },
      fonts: [{ family: 'Inter', file: 'i.ttf' }],
    });
    const done = fx.cli('restyle', file, '--kit', bad);
    assert.equal(done.code, 1);
    assert.match(done.err, /error {3}tokens\.color\.text: is not a usable color/);
    assert.match(done.err, /error {3}fonts\[0\]: "Inter" is a bundled family/);
    assert.match(done.err, /error {3}extends: Kit "bad" extends "nobody", which was not found/);
    assert.match(done.err, /the kit does not validate — nothing was restyled/);
    assert.deepEqual(read(file), before);
    for (const kit of [join(fx.project, 'nowhere'), fx.project, 'builtin:nope']) {
      const res = fx.cli('restyle', file, '--kit', kit);
      assert.equal(res.code, 1, kit);
      assert.match(res.err, /no such folder|it has no kit\.json|There is no built-in kit/);
    }
    assert.equal(fx.cli('restyle', file).code, 2, '--kit is required');
    assert.equal(fx.cli('restyle', '--kit', acme).code, 2);
    assert.equal(fx.cli('restyle', join(fx.project, 'ghost.json'), '--kit', acme).code, 1);
    assert.deepEqual(read(file), before);
  });
});
