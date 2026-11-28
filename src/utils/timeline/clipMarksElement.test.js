import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { kitState, standIn } from '#utils/brandUi/kitState.js';
import { elementDoc, kitOf } from '#utils/brandUi/testkit.js';
import { clipOf } from '#utils/edl/testkit.js';
import { loadDoc } from '#utils/editor/session.js';
import {
  elementClipLabel,
  elementColors,
  elementMark,
  elementName,
  mainSlotText,
  wordsOf,
} from './clipMarksElement.js';
import { drawClip } from './draw/clipBody.js';
import { clipColor, clipLabel } from './draw/clipFace.js';
import { contextMenu } from './menuModel.js';

const clean = kitOf('clean');
const made = elementDoc([
  ['lower-third', { name: '  Ada   Lovelace ', role: 'CEO' }, 1],
  ['bug', {}, 0],
  ['title', { title: 'Hello' }, 9],
]);
const clip = (i) => clipOf(made.doc, made.clipIds[i]);

/** A canvas context that remembers the text and the fills it was given. */
function recorder() {
  const seen = { text: [], fills: [] };
  const ctx = new Proxy(
    {},
    {
      get: (target, key) => {
        if (key === 'measureText') return (text) => ({ width: String(text).length * 6 });
        if (key === 'fillText') return (text) => seen.text.push(text);
        if (key === 'fill' || key === 'fillRect') return () => seen.fills.push(target.fillStyle);
        return key in target ? target[key] : () => {};
      },
      set: (target, key, value) => Reflect.set(target, key, value),
    },
  );
  return { ctx, seen };
}

/** Draw the clip at `index` of the first video track that holds it, 60 px a second. */
function draw(doc, clipId) {
  const track = doc.tracks.find((t) => t.clips.some((c) => c.clipId === clipId));
  const { ctx, seen } = recorder();
  const palette = {
    element: '#65a30d',
    clipText: '#fff',
    warning: '#d97706',
    selection: '#f59e0b',
    sans: 'sans',
  };
  const scene = /** @type {any} */ ({
    ...{ ctx, doc, palette, selected: new Set(), overlay: { hoverClipId: '' }, durations: {} },
    vp: { pps: 60, scrollX: 0, scrollY: 0, width: 1200, height: 300, zoom: 0.6 },
  });
  const index = track.clips.findIndex((c) => c.clipId === clipId);
  drawClip(scene, track, index, { y: 30, height: 56 });
  return seen;
}

beforeEach(() => kitState.set({ ...standIn('p1', 'fallback'), effective: clean }));

describe('what the timeline shows on an element clip', () => {
  it('names it by its main slot’s text, a label of its own, or the element', () => {
    assert.equal(wordsOf('lower-third'), 'Lower third');
    assert.equal(elementName(clip(0), clean), 'Lower third');
    assert.equal(elementName(clip(0), null), 'Lower third', 'without a kit: the id as words');
    assert.equal(elementName({ element: { id: '' } }, null), 'Brand element');
    assert.equal(mainSlotText(clip(0)), 'Ada Lovelace');
    assert.equal(mainSlotText(clip(1)), '');
    assert.equal(elementClipLabel(clip(1), clean), 'Logo bug');
    assert.equal(elementClipLabel({ ...clip(0), label: 'Guest' }, clean), 'Guest');
    assert.equal(clipLabel(clip(0)), 'Ada Lovelace');
    assert.equal(clipLabel({ ...clip(0), label: '' }), 'Ada Lovelace');
  });

  it('has a colour of its own and shows the design’s colours as chips', () => {
    const scene = /** @type {any} */ ({ palette: { element: '#65a30d', title: '#a855f7' } });
    assert.equal(clipColor(scene, clip(0), made.doc.tracks[0]), '#65a30d');
    const colors = elementColors(clip(0).element.design);
    assert.deepEqual(colors, ['#0f172a', '#2563eb', '#ffffff', '#cbd5e1']);
    assert.equal(elementColors(clip(0).element.design), colors, 'kept per design');
    assert.deepEqual(elementColors({ layers: [{ fill: '#ff000020' }, { color: 'red' }] }), []);
    assert.deepEqual(elementColors(null), []);
  });

  it('draws the label, the chips and the element’s name', () => {
    const seen = draw(made.doc, made.clipIds[0]);
    assert.deepEqual(seen.text, ['Lower third', 'Ada Lovelace']);
    assert.equal(seen.fills[0], '#65a30d');
    assert.deepEqual(seen.fills.slice(1, 5), ['#0f172a', '#2563eb', '#ffffff', '#cbd5e1']);
    assert.deepEqual(
      draw(made.doc, made.clipIds[1]).text,
      ['Logo bug'],
      'said once when both are the same',
    );
  });

  it('marks a clip that is out of date with the project’s kit', () => {
    assert.equal(elementMark(clip(0), new Map([[made.clipIds[0], 'outdated']])), 'outdated');
    assert.equal(elementMark(clipOf(made.doc, 'talk'), new Map([['talk', 'outdated']])), '');
    assert.equal(draw(made.doc, made.clipIds[0]).text.includes('out of date'), false);
    kitState.set({ ...standIn('p1', 'fallback'), effective: kitOf('bold') });
    assert.equal(draw(made.doc, made.clipIds[0]).text.includes('out of date'), true);
    const { title: _title, ...elements } = clean.elements;
    kitState.set({ ...standIn('p1', 'fallback'), effective: { ...clean, elements } });
    assert.equal(draw(made.doc, made.clipIds[2]).text.includes('not in brand'), true);
  });

  it('offers to update, detach and open the brand in the clip’s menu', () => {
    loadDoc(made.doc);
    const hit = /** @type {any} */ ({ zone: 'lanes', clipId: made.clipIds[0] });
    globalThis.navigator ||= /** @type {any} */ ({ platform: 'Linux' });
    const labels = (kit) => {
      kitState.set({ ...standIn('p1', 'fallback'), effective: kit });
      return contextMenu(hit, /** @type {any} */ ({}))
        .slice(0, 5)
        .map((item) => `${item.label || '—'}${item.disabled ? ' (off)' : ''}`);
    };
    assert.deepEqual(labels(clean).slice(0, 4), [
      'Update to brand (off)',
      'Detach from brand…',
      'Brand…',
      '—',
    ]);
    assert.deepEqual(labels(kitOf('bold')), [
      'Update to brand',
      'Update all 3 elements to brand',
      'Detach from brand…',
      'Brand…',
      '—',
    ]);
  });
});
