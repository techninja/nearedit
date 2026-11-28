import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import { registerClipBadge } from '#utils/timeline/badges.js';
import {
  DOT_MIN,
  PILL_MIN,
  badgeTitleAt,
  drawBadges,
  layoutBadges,
  resetBadgeSpots,
} from './badges.js';
import { drawClip } from './clipBody.js';

const CC = { id: 'captions', text: 'CC', tone: 'on', title: 'Captions: 8 words' };
const BUSY = { id: 'cutout', text: '…', tone: 'busy', title: 'Being made' };
const WARN = { id: 'captions', text: 'CC', tone: 'warn', title: 'No transcript' };
/** Six pixels a character, like the recorder below. */
const measure = (text) => text.length * 6;

let stops = [];
afterEach(() => {
  stops.forEach((stop) => stop());
  stops = [];
});
const register = (provider) => stops.push(registerClipBadge(provider));

/** A canvas context that remembers what was drawn on it. */
function recorder() {
  const seen = { text: [], fills: [], rects: [] };
  const canvas = {};
  const ctx = new Proxy(
    { canvas },
    {
      get: (target, key) => {
        if (key === 'measureText') return (text) => ({ width: measure(String(text)) });
        if (key === 'fillText') return (text, x) => seen.text.push([text, x]);
        if (key === 'roundRect') return (x, y, w, h) => seen.rects.push([x, y, w, h]);
        if (key === 'fill' || key === 'fillRect') return () => seen.fills.push(target.fillStyle);
        return key in target ? target[key] : () => {};
      },
      set: (target, key, value) => Reflect.set(target, key, value),
    },
  );
  return { ctx, seen, canvas };
}

/** Draw clip `c` (10 s long) of a one-clip document at a zoom. */
function draw(pps, clipExtra = {}) {
  // A title: nothing of the clip's body needs a browser to draw.
  const title = { sourceFile: '', text: { content: 'c.mp4' } };
  const doc = testEdl({ v1: [testClip('c', 0, 10, { ...title, ...clipExtra })] });
  const { ctx, seen, canvas } = recorder();
  const palette = { title: '#7c3aed', clipText: '#fff', warning: '#f59e0b', sans: 'sans', mono: 'm' };
  const vp = { pps, scrollX: 0, scrollY: 0, width: 800, height: 300 };
  const scene = { ctx, vp, doc, palette, selected: new Set(), overlay: {}, durations: {} };
  resetBadgeSpots(canvas);
  drawClip(/** @type {any} */ (scene), doc.tracks[0], 0, { y: 30, height: 50 });
  return { seen, canvas, scene, doc };
}

describe('where badges go', () => {
  it('lays pills out right to left from what is already taken', () => {
    const placed = layoutBadges([CC, BUSY], { width: 300, right: 500, taken: 22 }, measure);
    assert.deepEqual(
      placed.map(({ badge, x, width, dot }) => [badge.id, x, width, dot]),
      [
        ['captions', 455, 20, false],
        ['cutout', 438, 14, false],
      ],
    );
    assert.deepEqual(layoutBadges([], { width: 300, right: 500, taken: 0 }, measure), []);
  });

  it('shows one dot on a narrow clip — the most urgent badge — and nothing on a sliver', () => {
    const [dot] = layoutBadges([CC, BUSY, WARN], { width: PILL_MIN - 1, right: 100, taken: 0 }, measure);
    assert.deepEqual([dot.badge.tone, dot.dot, dot.width], ['warn', true, 7]);
    assert.deepEqual(layoutBadges([CC], { width: DOT_MIN - 1, right: 100, taken: 0 }, measure), []);
  });

  it('never draws over the clip’s left end', () => {
    const many = [CC, CC, CC, CC];
    const placed = layoutBadges(many, { width: 60, right: 60, taken: 0 }, measure);
    assert.equal(placed.length, 2);
    assert.ok(placed.every((pill) => pill.x >= 4));
  });
});

describe('badges on a clip', () => {
  it('draws what the features say, and leaves the label the room that is left', () => {
    const plain = draw(40);
    assert.deepEqual(
      plain.seen.text.map(([text]) => text),
      ['c.mp4'],
    );
    register((clip) => (clip.clipId === 'c' ? CC : null));
    const { seen, canvas } = draw(40);
    assert.deepEqual(
      seen.text.map(([text]) => text),
      ['CC', 'c.mp4'],
    );
    // The pill sits at the clip's right end (400 px), inside it.
    const [, x] = seen.text[0];
    assert.ok(x > 370 && x < 400, String(x));
    assert.equal(badgeTitleAt(canvas, x, 37), 'Captions: 8 words');
    assert.equal(badgeTitleAt(canvas, 100, 37), '');
    assert.equal(badgeTitleAt(canvas, x, 70), '');
  });

  it('sits beside the “fx” badge, and tones tell the states apart', () => {
    register(() => WARN);
    register(() => BUSY);
    const fx = { effects: [{ effectId: 'e1', type: 'blur', enabled: true, params: {} }] };
    const { seen } = draw(40, fx);
    const texts = seen.text.map(([text, x]) => [text, Math.round(x)]);
    const at = Object.fromEntries(texts);
    assert.deepEqual(
      texts.map(([text]) => text),
      ['CC', '…', 'c.mp4', 'fx'],
    );
    assert.ok(at['…'] < at.CC && at.CC < at.fx);
    assert.ok(seen.fills.includes('#f59e0b'), 'a warning is amber');
    assert.ok(seen.fills.includes('#fff'), 'a busy badge is the inverse of an “on” one');
  });

  it('keeps a long clip’s badge on screen, and a narrow clip gets a dot without text', () => {
    register(() => CC);
    const long = draw(400);
    const [, x] = long.seen.text.find(([text]) => text === 'CC');
    assert.ok(x < 800 && x > 760, String(x));
    const narrow = draw(3);
    assert.deepEqual(narrow.seen.text, []);
    assert.ok(narrow.seen.rects.some(([, , w, h]) => w === 7 && h === 7));
    assert.equal(badgeTitleAt(narrow.canvas, 22, 36), 'Captions: 8 words');
  });

  it('returns the room it took', () => {
    register(() => CC);
    const { scene, doc } = draw(40);
    const box = { x0: 0, x1: 400, y: 30, height: 50 };
    assert.equal(drawBadges(/** @type {any} */ (scene), doc.tracks[0].clips[0], doc.tracks[0], box, 0), 23);
    assert.equal(drawBadges(/** @type {any} */ (scene), doc.tracks[0].clips[0], doc.tracks[0], box, 22), 23);
  });
});
