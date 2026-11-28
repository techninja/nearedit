import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinKit,
  expandElement,
  kitKey,
  resolveElement,
  resolveKit,
} from '#utils/brand/index.js';
import { clip, doc, gen } from '../../../tests/compose/build.js';
import { createCanvas, createEnv, renderFrame } from '../../api/compose/index.js';
import { expansionOf } from './elementExpansion.js';
import { fontString } from './fonts.js';
import { frameInfo } from './frame.js';
import { composeFor } from './host.js';
import { layerKind, layersAt } from './layers.js';
import { elementImages, requirements } from './requirements.js';
import { setFont } from './text/draw.js';

const KIT = resolveKit(builtinKit('clean'));
const SLOTS = { name: 'Ada Lovelace', role: 'Mathematician', title: 'A title', text: 'Words' };
const SIZE = { width: 480, height: 270 };
const env = createEnv();
/** An element clip of the clean kit. */
const element = (id, extra = {}, slots = SLOTS) =>
  clip('el', {
    element: { kit: { id: 'clean', key: kitKey(KIT) }, id, slots, design: resolveElement(KIT, id) },
    ...extra,
  });
const backdrop = () => gen('bg', 'solid', { color: '#335577' });
const pixels = (edl, time, host = env) =>
  renderFrame(edl, time, { ...SIZE, env: host })
    .getContext('2d')
    .getImageData(0, 0, SIZE.width, SIZE.height).data;
/** The largest difference between two frames, levels of 255. */
function apart(a, b) {
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}
/** The layers of an element as ordinary clips on tracks of their own, front first. */
function expanded(id, duration, slots = SLOTS) {
  const ctx = createCanvas(8, 8).getContext('2d');
  const measure = (text, style) => (setFont(ctx, style), ctx.measureText(text).width);
  const layers = expandElement(resolveElement(KIT, id), slots, {
    duration,
    frame: { width: 1920, height: 1080 },
    measure,
  });
  return layers.map((layer) => [layer]).reverse();
}

describe('element clips in the compositor', () => {
  it('are a layer kind of their own', () => {
    const edl = doc([[element('lower-third')], [backdrop()]]);
    assert.equal(layerKind(edl.tracks[0].clips[0], edl.tracks[0]), 'element');
    assert.deepEqual(
      layersAt(edl, 1).map((layer) => layer.kind),
      ['generator', 'element'],
    );
    const both = element('lower-third', { generator: { type: 'solid' }, text: { content: 'x' } });
    assert.equal(layerKind(both, edl.tracks[0]), 'element', 'whatever else the clip holds');
  });

  it('draw exactly what their expansion draws as ordinary clips', () => {
    for (const id of ['lower-third', 'title', 'caption', 'chapter', 'stinger']) {
      const length = id === 'stinger' ? 1.2 : 4;
      const one = doc([[element(id, { timelineEnd: length, sourceOut: length })], [backdrop()]]);
      const many = doc([...expanded(id, length), [backdrop()]]);
      for (const time of [0.1, 0.3, length / 2, length - 0.15]) {
        const d = apart(pixels(one, time), pixels(many, time));
        assert.ok(d <= 2, `${id} at ${time}s differs from its layers by ${d} levels`);
      }
      assert.ok(
        apart(pixels(one, length / 2), pixels(doc([[backdrop()]]), 1)) > 40,
        `${id} draws something`,
      );
    }
  });

  it('treat the layers as one picture: transform, opacity, fades, effects, blend', () => {
    const plain = doc([[element('lower-third')], [backdrop()]]);
    const at = (extra, time = 2) =>
      pixels(doc([[element('lower-third', extra)], [backdrop()]]), time);
    const rest = pixels(plain, 2);
    const ink = (data) => data.reduce((n, v, i) => n + (i % 4 === 0 && v > 200 ? 1 : 0), 0);
    assert.ok(ink(rest) > 100, 'white text is there');
    assert.ok(apart(at({ transform: { y: -400 } }), rest) > 100, 'it moves as one');
    assert.ok(ink(at({ transform: { opacity: 0.2 } })) < ink(rest) / 4, 'and fades as one');
    assert.ok(ink(at({ fadeOut: 2 }, 3.9)) < ink(rest) / 4);
    const blurred = at({
      effects: [{ effectId: 'b', type: 'blur', enabled: true, params: { radius: 30 } }],
    });
    assert.ok(ink(blurred) < ink(rest) / 2, 'effects apply to the whole of it');
    assert.equal(ink(at({ transform: { scaleX: 0, scaleY: 0 } })), 0);
    assert.equal(apart(at({ transform: { x: 0 } }), rest), 0);
  });

  it('play split pieces as one run, and a lone piece on its own', () => {
    const whole = doc([[element('lower-third')], [backdrop()]]);
    const piece = (id, from, to) => ({
      ...element('lower-third'),
      clipId: id,
      timelineStart: from,
      timelineEnd: to,
      sourceIn: from,
      sourceOut: to,
    });
    const cut = doc([[piece('l', 0, 1.5), piece('r', 1.5, 4)], [backdrop()]]);
    for (const time of [0.2, 1.4, 1.5, 1.6, 3.9]) {
      assert.equal(
        apart(pixels(cut, time), pixels(whole, time)),
        0,
        `cut in two, the same picture at ${time}s`,
      );
    }
    const alone = doc([[piece('r', 1.5, 4)], [backdrop()]]);
    assert.ok(
      apart(pixels(alone, 1.6), pixels(whole, 1.6)) > 40,
      'without its neighbour it arrives again',
    );
    assert.equal(apart(pixels(alone, 3), pixels(whole, 3)), 0);
  });

  it('keep their expansion between frames, and lay out again only when they must', () => {
    const edl = doc([[element('lower-third')], [backdrop()]]);
    const block = edl.tracks[0].clips[0].element;
    const run = { edl, time: 1, frame: frameInfo(edl, 480, 270), compose: composeFor(env) };
    const ctx = createCanvas(8, 8).getContext('2d');
    const first = expansionOf(block, 4, run, ctx);
    assert.ok(first.length >= 4 && first.every((layer) => layer.kind !== 'element'));
    assert.equal(
      expansionOf(block, 4, run, ctx),
      first,
      'the same clip, length and frame: the same layers',
    );
    assert.equal(
      expansionOf(block, 4, { ...run, frame: frameInfo(edl, 1920, 1080) }, ctx),
      first,
      'whatever the canvas size',
    );
    assert.notEqual(expansionOf(block, 5, run, ctx), first, 'another length');
    assert.notEqual(expansionOf({ ...block }, 4, run, ctx), first, 'another block');
    const tall = { ...edl, resolution: '1080x1920' };
    assert.notEqual(
      expansionOf(block, 4, { ...run, frame: frameInfo(tall, 270, 480) }, ctx),
      first,
      'another frame',
    );
    assert.equal(expansionOf(block, 4, run, ctx), first, 'and back');
  });

  it('wait for their fonts, then draw', () => {
    let ready = false;
    const slow = { ...createEnv(), fontReady: () => ready };
    const empty = pixels(doc([[backdrop()]]), 1, slow);
    const titled = doc([[element('title')], [backdrop()]]);
    assert.equal(
      apart(pixels(titled, 2, slow), empty),
      0,
      'the whole element waits, its scrim too',
    );
    const waiting = pixels(doc([[element('caption')], [backdrop()]]), 1.5, slow);
    assert.equal(apart(waiting, empty), 0, 'nothing is laid out with a font that is not there');
    ready = true;
    assert.ok(apart(pixels(doc([[element('caption')], [backdrop()]]), 1.5, slow), empty) > 100);
  });

  it('draw nothing, and do not throw, for a design that is broken', () => {
    const empty = pixels(doc([[backdrop()]]), 1);
    for (const design of [
      {},
      { layers: [] },
      { layers: [{ type: 'shape', around: 'x' }] },
      { layers: 'no' },
    ]) {
      const broken = clip('el', {
        element: { kit: { id: '', key: '' }, id: 'x', slots: {}, design },
      });
      assert.equal(apart(pixels(doc([[broken], [backdrop()]]), 1), empty), 0);
    }
  });

  it('tell a host which pictures and fonts they need', () => {
    const logo = resolveKit({
      ...builtinKit('clean'),
      id: 'logo',
      tokens: { logo: { mark: '/kit/mark.png' } },
    });
    const bug = clip('bug', {
      element: {
        kit: { id: 'logo', key: kitKey(logo) },
        id: 'bug',
        slots: {},
        design: resolveElement(logo, 'bug'),
      },
    });
    const edl = doc([[bug], [element('lower-third')], [backdrop()]]);
    const needs = requirements(edl);
    assert.deepEqual(needs.images, ['/kit/mark.png']);
    assert.deepEqual(elementImages(edl), ['/kit/mark.png']);
    assert.deepEqual(needs.fonts, [
      {
        font: fontString({ fontFamily: 'Inter', weight: 700, fontSize: 72 }),
        text: 'Ada Lovelace',
      },
      {
        font: fontString({ fontFamily: 'Inter', weight: 400, fontSize: 72 }),
        text: 'Mathematician',
      },
    ]);
    const bare = requirements(doc([[element('lower-third', {}, { name: 'Ada' })]]));
    assert.deepEqual(
      bare.fonts.map((entry) => entry.text),
      ['Ada'],
      'an empty slot needs nothing',
    );
  });
});
