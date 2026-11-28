import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FONT, LOWER, SQUARE, TALL, WIDE, boxOf, expand, square } from './testkit.js';

describe('expandElement: placement', () => {
  it('holds a box at each anchor inside the safe margins, one unit a hundredth of the shorter side', () => {
    for (const [frame, unit] of [
      [WIDE, 10.8],
      [TALL, 10.8],
      [SQUARE, 10.8],
      [{ width: 1280, height: 720 }, 7.2],
    ]) {
      const m = Math.round(6 * unit);
      const at = (anchor, more) =>
        boxOf(
          expand({ layers: [square('s', { at: anchor, ...more })] }, {}, { frame }).by.s,
          frame,
        );
      const size = Math.round(10 * unit);
      assert.deepEqual([at('top-left').x, at('top-left').y], [m, m]);
      assert.deepEqual(
        [Math.round(at('bottom-right').right), Math.round(at('bottom-right').bottom)],
        [frame.width - m, frame.height - m],
      );
      assert.deepEqual(
        [at('center').x, at('center').y],
        [(frame.width - size) / 2, (frame.height - size) / 2].map(Math.round),
      );
      assert.ok(Math.abs(at('top-left', { x: 2, y: 3 }).x - (m + 2 * unit)) <= 1);
      assert.equal(
        at('top-left', { x: -50 }).x,
        m,
        'what is placed in the safe area never leaves it',
      );
      assert.equal(at('top-left', { inside: 'frame' }).x, 0);
      assert.equal(at('center').w, size);
    }
  });

  it('stacks a group, puts a plate around it and a bar beside it', () => {
    const { by } = expand(LOWER, { name: 'Ada Lovelace', role: 'Mathematician' });
    const [plate, bar] = [boxOf(by.plate), boxOf(by.bar)];
    assert.deepEqual(
      [plate.x, Math.round(plate.bottom)],
      [65, 1015],
      'the plate sits on the margins',
    );
    const name = by.name.text.fontSize * 1.15;
    const role = by.role.text.fontSize * 1.15;
    assert.ok(
      Math.abs(plate.h - (name + role + 10.8 + 2 * 21.6)) <= 1,
      'as tall as its members, the gap and the padding',
    );
    assert.deepEqual([by.name.text.align, by.name.text.content], ['left', 'Ada Lovelace']);
    assert.ok(by.name.transform.y < by.role.transform.y, 'in order, top to bottom');
    assert.equal(Math.round(bar.right), Math.round(plate.x - 10.8), 'a gap away');
    assert.deepEqual(
      [Math.round(bar.w), bar.h],
      [5, plate.h],
      'thickness across, the whole side along',
    );
  });

  it('leaves a layer out when its slot is empty, and the layout closes up', () => {
    const full = expand(LOWER, { name: 'Ada', role: 'CEO' });
    const bare = expand(LOWER, { name: 'Ada', role: '  ' });
    assert.deepEqual(Object.keys(bare.by), ['plate', 'bar', 'name']);
    assert.ok(boxOf(bare.by.plate).h < boxOf(full.by.plate).h - 30);
    assert.equal(Math.round(boxOf(bare.by.plate).bottom), 1015, 'still on the margin');
    const none = expand(LOWER, {});
    assert.deepEqual(none.clips, [], 'a plate around nothing is not there either');
    assert.deepEqual(none.warnings, []);
  });

  it('lays itself out anew for a tall and a square frame', () => {
    const slots = { name: 'Ada Lovelace', role: 'Mathematician' };
    const wide = expand(LOWER, slots).by;
    const tall = expand(LOWER, slots, { frame: TALL }).by;
    const squared = expand(LOWER, slots, { frame: SQUARE }).by;
    assert.equal(tall.name.text.fontSize, 75.6);
    assert.equal(wide.name.text.fontSize, 54);
    assert.equal(squared.name.text.fontSize, 54, 'square has no adjustment of its own');
    assert.equal(tall.bar, undefined, 'a format may switch a layer off');
    assert.equal(Math.round(boxOf(tall.plate, TALL).bottom), 1920 - 65 - 108);
    assert.equal(Math.round(boxOf(squared.plate, SQUARE).bottom), 1015);
  });

  it('places by another layer, whatever the order, and a text inside a shape', () => {
    const { by, warnings } = expand({
      layers: [
        { id: 'label', type: 'text', inside: 'disc', at: 'center', text: 'A', font: FONT, size: 4 },
        { id: 'ring', type: 'shape', around: 'disc', pad: 1, stroke: '#ffffff', fill: '' },
        square('disc', { at: 'top-right', shape: 'ellipse' }),
        square('tail', { beside: 'disc', side: 'bottom', gap: 2, w: 2, h: 4 }),
      ],
    });
    const [disc, ring, tail] = [boxOf(by.disc), boxOf(by.ring), boxOf(by.tail)];
    assert.deepEqual(warnings, []);
    assert.deepEqual([ring.w - disc.w, Math.round(ring.x - disc.x)], [22, -11]);
    assert.ok(Math.abs(tail.y - disc.bottom - 21.6) <= 1);
    assert.equal(
      Math.round(tail.x + tail.w / 2),
      Math.round(disc.x + disc.w / 2),
      'centred along the side',
    );
    assert.equal(
      Math.round(by.label.transform.x + 960),
      Math.round(disc.x + disc.w / 2),
      'the text sits in the disc',
    );
    assert.equal(by.ring.generator.params.filled, false);
  });

  it('sets a stack smaller when it is too tall for its place', () => {
    const tower = {
      groups: { stack: { at: 'center', gap: 2 } },
      layers: [1, 2, 3, 4, 5, 6].map((n) => ({
        id: `t${n}`,
        type: 'text',
        in: 'stack',
        text: `Line ${n}`,
        font: FONT,
        size: 16,
        minSize: 16,
      })),
    };
    const { clips } = expand(tower);
    const sizes = clips.map((clip) => clip.text.fontSize);
    assert.ok(sizes[0] < 16 * 10.8, 'smaller than asked');
    const [top, bottom] = [clips[0], clips[5]].map((clip) => 540 + clip.transform.y);
    assert.ok(
      top - sizes[0] * 0.575 >= 64 && bottom + sizes[0] * 0.575 <= 1016,
      'inside the margins',
    );
  });
});
