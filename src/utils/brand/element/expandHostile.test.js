import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEdl, createTrack } from '#utils/edl/factory.js';
import { validateEdl } from '#utils/edl/validate.js';
import { expandElement } from './expand.js';
import { normalizeDesign } from './normalize.js';
import { FONT, WIDE, design, expand, square } from './testkit.js';

describe('expandElement: broken and hostile designs', () => {
  it('expands to nothing with a warning, and never throws', () => {
    const frame = WIDE;
    for (const bad of [null, undefined, 7, 'design', [], {}, { layers: 'many' }]) {
      const warnings = [];
      assert.deepEqual(
        expandElement(bad, {}, { duration: 5, frame, warn: (m) => warnings.push(m) }),
        [],
      );
      assert.equal(warnings.length, 1, JSON.stringify(bad));
    }
    const fine = design({ layers: [square('s')] });
    for (const options of [
      undefined,
      null,
      {},
      { duration: 5 },
      { duration: 5, frame: { width: 0, height: 9 } },
      { duration: 5, frame: { width: NaN, height: 1080 } },
    ]) {
      assert.deepEqual(expandElement(fine, {}, options), []);
    }
    for (const duration of [0, -1, NaN, Infinity, '5']) {
      assert.deepEqual(expandElement(fine, {}, { duration, frame }), [], String(duration));
    }
    assert.equal(
      expandElement(fine, null, { duration: 5, frame }).length,
      1,
      'no slots is no problem',
    );
    const thrower = () => {
      throw new Error('boom');
    };
    const warnings = [];
    const text = design({ layers: [{ type: 'text', text: 'x', font: FONT }] });
    assert.deepEqual(
      expandElement(
        text,
        {},
        { duration: 5, frame, measure: thrower, warn: (m) => warnings.push(m) },
      ),
      [],
    );
    assert.match(warnings[0], /boom/);
  });

  it('leaves out a layer that is placed by way of itself, with a warning', () => {
    const { clips, warnings } = expand({
      groups: { g: { inside: 'b' } },
      layers: [
        square('a', { around: 'a' }),
        { id: 'b', type: 'shape', around: 'c', fill: '#000000' },
        { id: 'c', type: 'shape', around: 'b', fill: '#000000' },
        { id: 't', type: 'text', in: 'g', text: 'in a loop', font: FONT },
        square('ok'),
        square('lost', { around: 'nowhere' }),
      ],
    });
    assert.deepEqual(
      clips.map((clip) => clip.clipId),
      ['el-ok'],
    );
    assert.ok(
      warnings.length >= 2 && warnings.every((message) => /by way of itself/.test(message)),
    );
  });

  it('copes with values of the wrong kind, absurd sizes and unfilled references', () => {
    const raw = {
      kind: 'overlay',
      margin: 1e9,
      slots: ['a'],
      motion: { speed: -4, by: 7 },
      groups: { g: { gap: 1e9, pad: [1e9, -5], x: 'far' } },
      layers: [
        {
          id: 'big',
          type: 'shape',
          w: 1e12,
          h: -3,
          radius: 1e12,
          opacity: 99,
          rotate: 1e9,
          fill: '{color.primary}',
        },
        {
          id: 'text',
          type: 'text',
          in: 'g',
          text: '{slot.a}',
          font: '{font.heading}',
          size: 1e9,
          lines: -2,
          color: 'red',
          enter: { motion: 'slide-up', delay: -5, duration: 1e9, travel: 'far' },
        },
        { id: 'gen', type: 'generator', generator: 'no-such-generator', params: { x: 1 } },
        { id: 'img', type: 'image', src: '', h: 5 },
      ],
    };
    const warnings = [];
    const clips = expandElement(
      normalizeDesign(raw),
      { a: 'A'.repeat(5000) },
      { duration: 3, frame: WIDE, warn: (m) => warnings.push(m) },
    );
    const tracks = clips.map((clip, i) =>
      createTrack('video', { trackId: `v${i}`, clips: [clip] }),
    );
    const edl = createEdl({ tracks: [...tracks, createTrack('audio', { trackId: 'a1' })] });
    assert.deepEqual(validateEdl(edl).problems, [], 'whatever comes out is a valid clip');
    const text = clips.find((clip) => clip.clipId === 'el-text');
    assert.ok(text.text.content.length <= 2100 && text.text.fontSize <= 80 * 10.8);
    assert.equal(text.text.color, '#ffffff', 'what is not a colour falls back');
  });
});
