import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClip } from '#utils/edl/animate.js';
import { placeSource, resolveTransform } from '#utils/edl/geometry.js';
import { addEffect, setKeyframe, updateClip } from '#utils/edl/index.js';
import { assertValid, clipOf, deepFreeze } from '#utils/edl/testkit.js';
import { hasLook, setLook } from './looks.js';
import { applyPlacement } from './placementEdit.js';
import { CIRCLE_EFFECT, PLACEMENTS, placementGeometry, placementOf } from './placements.js';
import { cutoutDoc } from './testkit.js';

const FRAME = { width: 1920, height: 1080 };
const WIDE = { width: 1280, height: 720 };
const TALL = { width: 720, height: 1280 };

/**
 * Where a placement puts a picture in the frame: its rectangle, in pixels.
 * @param {string} id
 * @param {{ width: number, height: number }} source
 * @param {{ width: number, height: number }} [frame]
 */
function rect(id, source, frame = FRAME) {
  const { transform } = placementGeometry(id, frame, source);
  const flat = resolveTransform({ transform });
  const p = placeSource(source.width, source.height, frame.width, frame.height, flat);
  const round = (/** @type {number} */ value) => Math.round(value);
  return { left: round(p.dx), top: round(p.dy), width: round(p.dw), height: round(p.dh) };
}

describe('placement geometry', () => {
  it('stands a wide picture full height with its middle a quarter in from the side', () => {
    assert.deepEqual(rect('left', WIDE), { left: -480, top: 0, width: 1920, height: 1080 });
    assert.deepEqual(rect('right', WIDE), { left: 480, top: 0, width: 1920, height: 1080 });
  });

  it('keeps a narrow picture inside the frame, a little off the side', () => {
    const left = rect('left', TALL);
    assert.deepEqual(left, { left: 57, top: 0, width: 608, height: 1080 });
    const right = rect('right', TALL);
    assert.ok(Math.abs(right.left + right.width - (1920 - 57)) <= 1, 'mirrored');
  });

  it('puts a corner person at half height on the bottom edge', () => {
    assert.deepEqual(rect('corner-left', WIDE), { left: -134, top: 540, width: 960, height: 540 });
    const tall = rect('corner-right', TALL);
    assert.equal(tall.top + tall.height, 1080, 'standing on the bottom edge');
    assert.ok(Math.abs(tall.left + tall.width - (1920 - 57)) <= 1, 'near the right side');
    assert.equal(tall.height, 540);
  });

  it('covers a round window in the corner with the picture, whatever its shape', () => {
    for (const source of [WIDE, TALL]) {
      const { circle } = placementGeometry('circle-right', FRAME, source);
      const size = { w: circle.width * 1920, h: circle.height * 1080 };
      assert.ok(Math.abs(size.w - size.h) < 0.5, 'a circle in pixels');
      assert.ok(Math.abs(size.w - 324) < 0.5, '30 % of the shorter side');
      const centre = { x: circle.center.x * 1920, y: circle.center.y * 1080 };
      const picture = rect('circle-right', source);
      assert.ok(picture.left <= centre.x - size.w / 2 + 1, 'covered on the left');
      assert.ok(picture.left + picture.width >= centre.x + size.w / 2 - 1, 'and on the right');
      assert.ok(picture.top <= centre.y - size.h / 2 + 1, 'at the top');
      assert.ok(picture.top + picture.height >= centre.y + size.h / 2 - 1, 'and at the bottom');
      assert.ok(Math.abs(picture.left + picture.width / 2 - centre.x) <= 1, 'centred on it');
      assert.ok(centre.x + size.w / 2 < 1920 && centre.y + size.h / 2 < 1080, 'inside the frame');
    }
  });

  it('works in a tall frame and knows nothing of an unknown placement', () => {
    const frame = { width: 1080, height: 1920 };
    const full = rect('left', WIDE, frame);
    assert.equal(full.height, 1920, 'full height even where the picture overflows the sides');
    assert.equal(placementGeometry('nowhere', FRAME, WIDE), null);
    assert.equal(placementGeometry('left', { width: 0, height: 0 }), null);
    assert.equal(PLACEMENTS.length, 7);
  });
});

describe('placing clips', () => {
  const start = deepFreeze(cutoutDoc());
  const sizeOf = () => WIDE;

  it('writes an ordinary transform, and says which placement a clip is in', () => {
    const placed = assertValid(applyPlacement(start, ['me'], 'corner-left', sizeOf));
    const { transform, effects } = clipOf(placed, 'me');
    assert.deepEqual(
      [transform.fit, transform.x, transform.y, transform.scaleX, transform.scaleY],
      ['contain', -614, 270, 0.5, 0.5],
    );
    assert.equal(effects.length, 0);
    assert.equal(placementOf(clipOf(placed, 'me'), FRAME, WIDE), 'corner-left');
    assert.equal(placementOf(clipOf(start, 'me'), FRAME, WIDE), 'fill', 'an untouched clip');
    const moved = updateClip(placed, 'me', { transform: { x: -500 } });
    assert.equal(placementOf(clipOf(moved, 'me'), FRAME, WIDE), '', 'moved by hand');
    assert.equal(
      applyPlacement(placed, ['me'], 'corner-left', sizeOf),
      placed,
      'nothing to change',
    );
    assert.equal(clipOf(placed, 'me2').transform.x, 0, 'only the clips that were asked for');
  });

  it('adds the round window as a mask before what follows the shape, and removes it', () => {
    const lit = setLook(setLook(start, ['me'], 'shadow', true), ['me'], 'outline', true);
    const round = assertValid(applyPlacement(lit, ['me'], 'circle-left', sizeOf));
    const stack = clipOf(round, 'me').effects;
    assert.deepEqual(
      stack.map((fx) => fx.type),
      ['mask', 'outline', 'dropShadow'],
    );
    assert.equal(stack[0].effectId, CIRCLE_EFFECT);
    assert.equal(stack[0].params.shape, 'ellipse');
    assert.equal(placementOf(clipOf(round, 'me'), FRAME, WIDE), 'circle-left');
    const other = applyPlacement(round, ['me'], 'circle-right', sizeOf);
    assert.equal(clipOf(other, 'me').effects.length, 3, 'the window moves, it is not added twice');
    assert.ok(clipOf(other, 'me').effects[0].params.center.x > 0.5);
    const back = applyPlacement(other, ['me'], 'fill', sizeOf);
    assert.deepEqual(
      clipOf(back, 'me').effects.map((fx) => fx.type),
      ['outline', 'dropShadow'],
    );
    assert.equal(clipOf(back, 'me').transform.fit, 'cover');
  });

  it('leaves a mask the person made alone, and clears what would move the clip away', () => {
    const own = addEffect(start, 'me', 'mask', { params: { shape: 'rectangle' } });
    const keyed = setKeyframe(own, 'me', 'transform.x', 1, 300);
    const cropped = updateClip(keyed, 'me', { transform: { cropLeft: 0.2, rotation: 15 } });
    const placed = assertValid(applyPlacement(cropped, ['me'], 'left', sizeOf));
    const clip = clipOf(placed, 'me');
    assert.equal(clip.effects.length, 1, 'their mask stays');
    assert.equal(clip.keyframes['transform.x'], undefined);
    assert.deepEqual([clip.transform.cropLeft, clip.transform.rotation], [0, 0]);
    assert.equal(resolveClip(clip, 1).transform.x, -480, 'it is where the placement put it');
  });
});

describe('shadow and outline', () => {
  const start = deepFreeze(cutoutDoc());

  it('adds a soft shadow, the outline before it, and takes them away again', () => {
    const shadowed = assertValid(setLook(start, ['me', 'me2'], 'shadow', true));
    const [shadow] = clipOf(shadowed, 'me').effects;
    assert.equal(shadow.type, 'dropShadow');
    assert.deepEqual(shadow.params, { x: 10, y: 16, blur: 26, opacity: 0.55 });
    assert.equal(hasLook(clipOf(shadowed, 'me2'), 'shadow'), true, 'on every clip asked for');
    const both = setLook(shadowed, ['me'], 'outline', true);
    assert.deepEqual(
      clipOf(both, 'me').effects.map((fx) => fx.type),
      ['outline', 'dropShadow'],
    );
    assert.equal(setLook(both, ['me'], 'outline', true), both, 'already there');
    const plain = setLook(setLook(both, ['me'], 'outline', false), ['me'], 'shadow', false);
    assert.equal(clipOf(plain, 'me').effects.length, 0);
    assert.equal(hasLook(clipOf(plain, 'me'), 'shadow'), false);
  });

  it('switches an existing effect back on instead of adding a second', () => {
    const off = addEffect(start, 'me', 'dropShadow', { enabled: false, params: { blur: 3 } });
    assert.equal(hasLook(clipOf(off, 'me'), 'shadow'), false);
    const on = setLook(off, ['me'], 'shadow', true);
    const stack = clipOf(on, 'me').effects;
    assert.equal(stack.length, 1);
    assert.deepEqual([stack[0].enabled, stack[0].params.blur], [true, 3]);
  });

  it('scales the shadow with the frame', () => {
    const small = setLook({ ...start, resolution: '960x540' }, ['me'], 'shadow', true);
    assert.deepEqual(clipOf(small, 'me').effects[0].params, {
      x: 5,
      y: 8,
      blur: 13,
      opacity: 0.55,
    });
  });
});
