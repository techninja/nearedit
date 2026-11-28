import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { splitClips, trimClipStart, updateClip } from '#utils/edl/index.js';
import { clipOf, testClip, testEdl } from '#utils/edl/testkit.js';
import { setWebRecording, updateWebRecipe } from '#utils/edl/webClip.js';
import { recipeKey } from '#utils/web/index.js';
import { webDoc } from '#utils/webUi/testkit.js';
import { webLabel, webMark, webTickAt, webTicks } from './clipMarksWeb.js';
import { clipColor, clipLabel, drawClip } from './draw/clipBody.js';

// lead 0.6 | click 0.7 + 0.6 | wait 1 | press 0.15 + 0.4 | tail 1 → 4.4667 s
const STEPS = [{ do: 'click', target: 'text=Go' }, { do: 'wait' }, { do: 'press', key: 'Tab' }];
const made = () => webDoc(STEPS);
const record = (doc, clipId) => {
  const key = recipeKey(clipOf(doc, clipId).web.recipe, 30);
  const file = `/p/.nearedit/web/${key}.mp4`;
  return setWebRecording(doc, clipId, { file, key, duration: 4.4667, title: 'Example Page' });
};

/** A canvas context that writes down what is drawn on it. */
function fakeContext() {
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      void calls.push([name, ...args]);
  const ctx = { calls, measureText: (text) => ({ width: text.length * 5 }) };
  for (const name of [
    'fillRect',
    'fillText',
    'beginPath',
    'rect',
    'roundRect',
    'fill',
    'stroke',
    'save',
    'restore',
    'clip',
    'moveTo',
    'lineTo',
    'closePath',
    'strokeRect',
    'drawImage',
  ])
    ctx[name] = record(name);
  return ctx;
}
const PALETTE = {
  web: '#0891b2',
  video: '#3b82f6',
  placeholder: '#64748b',
  clipText: '#fff',
  warning: '#d97706',
  selection: '#f59e0b',
  sans: 'sans',
  mono: 'mono',
};
function scene(doc, pps = 100) {
  const ctx = fakeContext();
  const vp = { pps, scrollX: 0, scrollY: 0, width: 1000, height: 300 };
  const overlay = { guide: null, marquee: null, drop: null, hoverClipId: '' };
  return { ctx, vp, doc, palette: PALETTE, selected: new Set(), overlay, durations: {}, lanes: [] };
}
const texts = (ctx) => ctx.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);

describe('web clip marks', () => {
  it('names a web clip by a label somebody gave it, else its title, else its host', () => {
    const { doc, clipId } = made();
    assert.equal(webLabel(clipOf(doc, clipId)), 'example.com');
    assert.equal(clipLabel(clipOf(doc, clipId)), 'example.com');
    const recorded = record(doc, clipId);
    assert.equal(webLabel(clipOf(recorded, clipId)), 'Example Page');
    const named = updateClip(recorded, clipId, { label: 'Sign-up demo' });
    assert.equal(webLabel(clipOf(named, clipId)), 'Sign-up demo');
    assert.equal(clipLabel(testClip('v', 0, 2)), 'v.mp4');
  });

  it('says what a web clip still lacks', () => {
    const { doc, clipId } = made();
    assert.equal(webMark(clipOf(doc, clipId), 30), 'unrecorded');
    const recorded = record(doc, clipId);
    assert.equal(webMark(clipOf(recorded, clipId), 30), '');
    const changed = updateWebRecipe(recorded, clipId, (r) => ({ ...r, tail: 2 }));
    assert.equal(webMark(clipOf(changed, clipId), 30), 'stale');
    assert.equal(webMark(testClip('v', 0, 2), 30), '');
  });

  it('puts a tick where each step begins, with the room after it', () => {
    const { doc, clipId } = made();
    const ticks = webTicks(clipOf(doc, clipId), 30, 100);
    assert.deepEqual(
      ticks.map((tick) => [tick.index, tick.label, Math.round(tick.time * 100) / 100]),
      [
        [0, 'Click: text=Go', 0.6],
        [1, 'Wait', 1.9],
        [2, 'Press a key: Tab', 2.9],
      ],
    );
    assert.deepEqual(
      ticks.map((tick) => Math.round(tick.room)),
      [130, 100, 157],
    );
    assert.deepEqual(webTicks(testClip('v', 0, 2), 30, 100), []);
  });

  it('keeps ticks with the picture through a move, a trim and a split', () => {
    const { doc, clipId } = made();
    const trimmed = trimClipStart(doc, clipId, 1);
    const kept = webTicks(clipOf(trimmed, clipId), 30, 100);
    assert.deepEqual(
      kept.map((tick) => [tick.index, Math.round(tick.time * 100) / 100]),
      [
        [1, 1.9],
        [2, 2.9],
      ],
    );
    const halves = splitClips(doc, 2.5);
    const [left, right] = halves.tracks.flatMap((track) => track.clips);
    assert.deepEqual(
      webTicks(left, 30, 100).map((tick) => tick.index),
      [0, 1],
    );
    assert.deepEqual(
      webTicks(right, 30, 100).map((tick) => tick.index),
      [2],
    );
  });

  it('merges ticks that would touch and shows none on a sliver', () => {
    const { doc, clipId } = made();
    const clip = clipOf(doc, clipId);
    assert.deepEqual(
      webTicks(clip, 30, 4).map((tick) => tick.index),
      [],
    );
    const quick = webDoc([
      { do: 'wait', duration: 0.1 },
      { do: 'wait', duration: 3 },
    ]);
    const ticks = webTicks(clipOf(quick.doc, quick.clipId), 30, 20);
    assert.deepEqual(
      ticks.map((tick) => tick.index),
      [0],
    );
    assert.equal(webTickAt(clip, 30, 1.93, 100, 5).index, 1);
    assert.equal(webTickAt(clip, 30, 1.2, 100, 5), null);
  });
});

describe('drawing a web clip', () => {
  const lane = { y: 30, height: 60 };
  // The filmstrip of a recorded clip is fetched as an image: none arrives here.
  before(() => void (globalThis.Image = /** @type {any} */ (class {})));
  after(() => void delete globalThis.Image);

  it('draws an unrecorded clip as a placeholder with its address and ticks, in its own colour', () => {
    const { doc } = made();
    const view = scene(doc);
    drawClip(view, doc.tracks[0], 0, lane);
    assert.equal(clipColor(view, doc.tracks[0].clips[0], doc.tracks[0]), '#0891b2');
    const drawn = texts(view.ctx);
    assert.ok(drawn.includes('example.com/'), 'the address in the body');
    assert.ok(drawn.includes('not recorded'), 'the mark');
    assert.ok(drawn.includes('1 Click: text=Go'), 'a tick label');
    assert.ok(drawn.includes('2 Wait'));
    assert.ok(
      view.ctx.calls.some(([name]) => name === 'lineTo'),
      'hatching',
    );
  });

  it('marks a clip that is out of date, and nothing on one that is recorded', () => {
    const { doc, clipId } = made();
    const recorded = record(doc, clipId);
    const fine = scene(recorded);
    drawClip(fine, recorded.tracks[0], 0, lane);
    assert.deepEqual(
      texts(fine.ctx).filter((text) => /recorded|out of date/.test(text)),
      [],
    );
    assert.ok(texts(fine.ctx).includes('Example Page'));
    const changed = updateWebRecipe(recorded, clipId, (r) => ({ ...r, tail: 2 }));
    const stale = scene(changed);
    drawClip(stale, changed.tracks[0], 0, lane);
    assert.ok(texts(stale.ctx).includes('out of date'));
  });

  it('drops the labels, then the ticks, as the clip gets narrow', () => {
    const { doc } = made();
    const narrow = scene(doc, 20);
    drawClip(narrow, doc.tracks[0], 0, lane);
    assert.deepEqual(
      texts(narrow.ctx).filter((text) => /Click|Wait/.test(text)),
      [],
    );
    const sliver = scene(doc, 1.5);
    drawClip(sliver, doc.tracks[0], 0, lane);
    assert.deepEqual(texts(sliver.ctx), []);
  });

  it('leaves other clips exactly as they were', () => {
    const doc = testEdl({ v1: [testClip('v', 0, 4)] });
    const view = scene(doc);
    drawClip(view, doc.tracks[0], 0, lane);
    assert.deepEqual(texts(view.ctx), ['v.mp4']);
  });
});
