import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadImage } from '@napi-rs/canvas';
import { logoMarkup } from '#atoms/app-logo/markup.js';
import * as shapes from '#atoms/app-logo/shapes.js';
import { RENDITIONS, drawRendition } from '../../scripts/build-logo.js';

/** The SVG files here are the source of truth; this keeps every copy honest. */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (/** @type {string} */ name) => readFileSync(`${HERE}${name}`, 'utf8');
const all = (/** @type {string} */ text, /** @type {RegExp} */ re) =>
  [...text.matchAll(re)].map((match) => match[1]);
const paths = (/** @type {string} */ svg) => all(svg, /<path d="([^"]+)"/g);
const rects = (/** @type {string} */ svg) =>
  all(svg, /<rect ([^>]*)\/>/g)
    .map((attrs) => Object.fromEntries(all(attrs, /(\w+="[^"]*")/g).map((a) => a.split('='))))
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.replaceAll('"', '')])));

const FILES = [
  'favicon.svg',
  'icon-on-light.svg',
  'icon.svg',
  'mark-tile.svg',
  'mark.svg',
  'wordmark-ink.svg',
  'wordmark-on-dark.svg',
  'wordmark-on-light.svg',
  'wordmark-white.svg',
];
const BRAND = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#0f172a', '#f8fafc', '#ffffff'];
const HAIRLINE = '#e2e8f0';

/** The clips of a drawing whose stem starts at `x`, as the shapes module gives them. */
const clipsAt = (/** @type {number} */ x) =>
  shapes.CLIPS.map((clip) => ({
    x: String(x + shapes.STEM / 2),
    y: String(clip.y),
    width: String(clip.end - shapes.STEM / 2),
    height: String(shapes.CLIP_HEIGHT),
    rx: String(shapes.CLIP_RADIUS),
    fill: clip.fill,
  }));

describe('the logo files', () => {
  it('are the nine drawings, each a plain SVG with a box', () => {
    assert.deepEqual(
      readdirSync(HERE)
        .filter((name) => name.endsWith('.svg'))
        .sort(),
      FILES,
    );
    for (const name of FILES) {
      assert.match(read(name), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[-\d. ]+"/);
    }
  });

  it('need no font and no other file: outlines only', () => {
    for (const name of FILES) {
      assert.doesNotMatch(read(name), /<text|font-|<image|href|<style|<script/, name);
    }
  });

  it('use the brand colours and nothing else', () => {
    for (const name of FILES) {
      const used = new Set(all(read(name), /(?:fill|stroke)="(#[0-9a-f]{6})"/g));
      const allowed = name === 'icon-on-light.svg' ? [...BRAND, HAIRLINE] : BRAND;
      assert.deepEqual(
        [...used].filter((colour) => !allowed.includes(colour)),
        [],
        name,
      );
      assert.deepEqual(
        Object.values(shapes.COLORS).filter((c) => !BRAND.includes(c)),
        [],
      );
    }
  });

  it('draw the same wordmark four times, in different inks', () => {
    const bare = (/** @type {string} */ name) => [paths(read(name)), rects(read(name)).length];
    const first = bare('wordmark-on-dark.svg');
    for (const name of FILES.filter((file) => file.startsWith('wordmark'))) {
      assert.deepEqual(bare(name), first, name);
    }
    assert.deepEqual(
      new Set(all(read('wordmark-white.svg'), /fill="([^"]+)"/g)),
      new Set(['#ffffff']),
    );
    assert.deepEqual(
      new Set(all(read('wordmark-ink.svg'), /fill="([^"]+)"/g)),
      new Set(['#0f172a']),
    );
  });
});

describe('the app-logo shapes', () => {
  it('are the wordmark file: seven letters, three clips, the playhead', () => {
    const svg = read('wordmark-on-dark.svg');
    const letters = ['N', 'e', 'a', 'r', 'd', 'i', 't'].map((name) => shapes.LETTERS[name]);
    assert.deepEqual(paths(svg), [...letters, shapes.playhead(shapes.WORDMARK.stem)]);
    assert.deepEqual(rects(svg), clipsAt(shapes.WORDMARK.stem));
    assert.ok(svg.includes(`viewBox="${shapes.WORDMARK.viewBox}"`));
    assert.deepEqual([...shapes.NEAR].reverse().concat(shapes.DIT).join(''), 'Neardit');
  });

  it('are the icon file: the tile, the N, the clips, the playhead', () => {
    const svg = read('icon.svg');
    assert.deepEqual(paths(svg), [shapes.ICON.n, shapes.playhead(shapes.ICON.stem)]);
    const [tile, ...clips] = rects(svg);
    assert.deepEqual(tile, {
      width: '224',
      height: '224',
      rx: String(shapes.ICON.radius),
      fill: '#0f172a',
    });
    assert.deepEqual(clips, clipsAt(shapes.ICON.stem));
    assert.ok(svg.includes(`viewBox="${shapes.ICON.viewBox}"`));
    assert.ok(svg.includes(`translate(${shapes.ICON.at.join(' ')})`));
    assert.deepEqual(
      paths(read('icon-on-light.svg')),
      paths(svg),
      'the light icon is the same drawing',
    );
  });

  it('are the mark file, and the mark on its tile is the same E', () => {
    const svg = read('mark.svg');
    assert.deepEqual(paths(svg), [shapes.playhead(shapes.MARK.stem)]);
    assert.deepEqual(rects(svg), clipsAt(shapes.MARK.stem));
    assert.ok(svg.includes(`viewBox="${shapes.MARK.viewBox}"`));
    assert.deepEqual(paths(read('mark-tile.svg')), paths(svg));
    assert.deepEqual(rects(read('mark-tile.svg')).slice(1), rects(svg));
  });

  it('reach the page: the markup of each variant holds its shapes', () => {
    for (const name of Object.values(shapes.LETTERS))
      assert.ok(logoMarkup('wordmark').includes(name));
    assert.ok(logoMarkup('wordmark').includes(shapes.playhead(shapes.WORDMARK.stem)));
    assert.ok(logoMarkup('icon').includes(shapes.ICON.n));
    assert.ok(logoMarkup('icon').includes(shapes.playhead(shapes.ICON.stem)));
    assert.ok(logoMarkup('mark').includes(shapes.playhead(shapes.MARK.stem)));
    assert.equal(logoMarkup('no such variant'), logoMarkup('wordmark'));
    for (const variant of ['wordmark', 'icon', 'mark']) {
      assert.equal(all(logoMarkup(variant), /(class="app-logo-clip")/g).length, 3, variant);
      assert.doesNotMatch(logoMarkup(variant), /<text|font-/);
    }
  });
});

describe('the PNG pictures', () => {
  for (const rendition of RENDITIONS) {
    it(`${rendition.out} is what ${rendition.from} draws`, async () => {
      const wanted = await drawRendition(rendition);
      const saved = await loadImage(readFileSync(`${ROOT}${rendition.out}`));
      assert.deepEqual([saved.width, saved.height], [wanted.width, wanted.height]);
      assert.equal(saved.width, rendition.width);
      const { width, height } = wanted;
      const ctx = wanted.getContext('2d');
      const a = ctx.getImageData(0, 0, width, height).data;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(saved, 0, 0);
      const b = ctx.getImageData(0, 0, width, height).data;
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
      // Another machine may round an edge pixel differently; a changed drawing is far off.
      assert.ok(
        sum / a.length < 0.5,
        `mean difference ${sum / a.length} of 255: run build-logo.js`,
      );
    });
  }
});
