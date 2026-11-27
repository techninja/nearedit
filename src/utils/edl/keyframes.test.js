import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

const FRAME = 1 / 30;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);

/** A title at 10–16 whose source window starts at 4, a generator with one effect, a locked clip. */
const doc = () =>
  deepFreeze(
    assertValid(
      testEdl({
        v2: [
          testClip('gen', 0, 5, {
            sourceFile: '',
            generator: { type: 'gradient', seed: 1, params: { angle: 45, tint: '#ff0000' } },
            effects: [{ effectId: 'fx', type: 'blur', enabled: true, params: { radius: 6 } }],
          }),
        ],
        v1: [
          testClip('t', 10, 16, {
            sourceFile: '',
            sourceIn: 4,
            sourceOut: 10,
            text: { content: 'Hi', color: '#ffffff' },
            transform: { x: 50, opacity: 0.5 },
            linkedClipId: 'a',
          }),
        ],
        a1: [testClip('a', 10, 16, { linkedClipId: 't' })],
      }),
    ),
  );
const keysOf = (edl, id, path) => clipOf(edl, id).keyframes[path];
const xAt = (edl, time) => E.resolveClip(clipOf(edl, 't'), time).transform.x;
const ok = (edl) => {
  assertValid(edl);
  assert.deepEqual(E.normalizeEdl(edl), edl, 'normalising the result changes nothing');
  return edl;
};

describe('setKeyframe', () => {
  it('takes a timeline time and stores clip-local source time, sorted', () => {
    let out = ok(E.setKeyframe(doc(), 't', 'transform.x', 14, 300, { ease: 'ease-out' }));
    out = ok(E.setKeyframe(out, 't', 'transform.x', 11, 100));
    assert.deepEqual(keysOf(out, 't', 'transform.x'), [
      { t: 5, v: 100, ease: 'linear' },
      { t: 8, v: 300, ease: 'ease-out' },
    ]);
    assert.deepEqual([xAt(out, 10), xAt(out, 12.5), xAt(out, 15.9)], [100, 200, 300]);
    assert.equal(clipOf(out, 't').transform.x, 50, 'the plain value is kept underneath');
    assert.deepEqual(clipOf(out, 'a').keyframes, {}, 'the linked partner is not touched');
  });

  it('replaces the key at that time within half a frame, keeping its time and easing', () => {
    const one = E.setKeyframe(doc(), 't', 'transform.x', 12, 100, { ease: 'hold' });
    const again = ok(E.setKeyframe(one, 't', 'transform.x', 12 + FRAME * 0.4, 250));
    assert.deepEqual(keysOf(again, 't', 'transform.x'), [{ t: 6, v: 250, ease: 'hold' }]);
    const beside = ok(E.setKeyframe(one, 't', 'transform.x', 12 + FRAME, 250));
    assert.equal(keysOf(beside, 't', 'transform.x').length, 2, 'one frame away is another key');
    assert.equal(E.setKeyframe(one, 't', 'transform.x', 12, 100), one, 'no change, same document');
    const snapped = E.setKeyframe(doc(), 't', 'transform.x', 12.01, 1);
    near(keysOf(snapped, 't', 'transform.x')[0].t, 6, 'new keys land on the frame grid');
  });

  it('accepts what suits the property: clamped numbers, colours for colours', () => {
    let out = E.setKeyframe(doc(), 't', 'transform.opacity', 12, 7);
    assert.equal(keysOf(out, 't', 'transform.opacity')[0].v, 1);
    out = ok(E.setKeyframe(out, 't', 'text.color', 12, '#00ff00'));
    out = ok(E.setKeyframe(out, 't', 'volume', 12, '1.5'));
    assert.deepEqual(
      [keysOf(out, 't', 'text.color')[0].v, keysOf(out, 't', 'volume')[0].v],
      ['#00ff00', 1.5],
    );
    out = ok(E.setKeyframe(doc(), 'gen', 'generator.params.tint', 1, '#0000ff'));
    out = ok(E.setKeyframe(out, 'gen', 'generator.params.size.x', 1, 0.25));
    out = ok(E.setKeyframe(out, 'gen', 'effects.fx.radius', 1, 500));
    out = ok(E.setKeyframe(out, 'gen', 'effects.fx.center.x', 2, 0.5));
    const at = E.resolveClip(clipOf(out, 'gen'), 3);
    assert.deepEqual(at.generator.params, { angle: 45, tint: '#0000ff', size: { x: 0.25 } });
    assert.deepEqual(at.effects[0].params, { radius: 500, center: { x: 0.5 } });
    assert.ok(Array.isArray(at.effects), 'a deep effect path leaves the stack an array');
  });

  it('refuses paths that cannot be animated, bad values, locked tracks and unknown clips', () => {
    const start = doc();
    const refused = [
      ['t', 'timelineStart', 1],
      ['t', 'fadeIn', 1],
      ['t', 'sourceIn', 1],
      ['t', 'transform.fit', 1],
      ['t', 'text.content', 1],
      ['t', 'transform.kenBurns.enabled', 1],
      ['t', 'effects.fx.radius', 1],
      ['t', 'generator.params.angle', 1],
      ['t', 'transform.x', 'left'],
      ['t', 'transform.x', '#ffffff'],
      ['t', 'text.color', 3],
      ['t', 'transform.__proto__.x', 1],
      ['t', 'transform..x', 1],
      ['gen', 'effects.fx', 1],
      ['gen', 'generator.type', 1],
      ['nope', 'transform.x', 1],
    ];
    for (const [id, path, value] of refused) {
      assert.equal(E.setKeyframe(start, id, path, 12, value), start, `${id} ${path} ${value}`);
    }
    assert.equal(E.setKeyframe(start, 't', 'transform.x', NaN, 1), start);
    for (const path of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '']) {
      const calls = [
        () => E.setKeyframe(start, 't', path, 12, 1),
        () => E.removeKeyframe(start, 't', path, 12),
        () => E.moveKeyframe(start, 't', path, 12, 13),
        () => E.setKeyframeEase(start, 't', path, 12, 'hold'),
        () => E.clearKeyframes(start, 't', path),
        () => E.setAnimated(start, 't', path, false, 12),
        () => E.setAnimated(start, 't', path, true, 12),
        () => E.setValueAt(start, 't', path, 1, 12),
        () => E.removeKeyframesAt(start, 't', 12, [path]),
        () => E.moveKeyframesAt(start, 't', 12, 13, [path]),
      ];
      for (const call of calls) assert.equal(call(), start, `"${path}" is not a property`);
      assert.deepEqual([E.isAnimated({ keyframes: {} }, path), E.keysOf({}, path)], [false, []]);
    }
    const locked = deepFreeze(E.toggleTrackLock(start, 'v1'));
    assert.equal(E.setKeyframe(locked, 't', 'transform.x', 12, 1), locked);
    assert.equal(E.describePath(clipOf(start, 'gen'), 'effects.fx.radius').kind, 'open');
    assert.equal(E.describePath(clipOf(start, 't'), 'text.color').kind, 'color');
    assert.equal(E.describePath(clipOf(start, 't'), 'label'), null);
  });
});

describe('removing, moving and easing keys', () => {
  const keyed = () => {
    let out = doc();
    for (const [time, value] of [
      [11, 100],
      [13, 300],
      [15, 500],
    ])
      out = E.setKeyframe(out, 't', 'transform.x', time, value);
    return deepFreeze(E.setKeyframe(out, 't', 'transform.opacity', 13, 1));
  };

  it('removeKeyframe removes the key at a time; the last one leaves its value behind', () => {
    const start = keyed();
    const out = ok(E.removeKeyframe(start, 't', 'transform.x', 13 + FRAME * 0.3));
    assert.deepEqual(
      keysOf(out, 't', 'transform.x').map((k) => k.v),
      [100, 500],
    );
    assert.equal(E.removeKeyframe(start, 't', 'transform.x', 12), start, 'no key there');
    const last = ok(E.removeKeyframe(start, 't', 'transform.opacity', 13));
    assert.equal(keysOf(last, 't', 'transform.opacity'), undefined);
    assert.equal(clipOf(last, 't').transform.opacity, 1, 'was 0.5 before it was animated');
    assert.deepEqual(Object.keys(clipOf(last, 't').keyframes), ['transform.x']);
  });

  it('moveKeyframe re-times one key, re-sorts, and replaces a key at the destination', () => {
    const start = keyed();
    const out = ok(E.moveKeyframe(start, 't', 'transform.x', 11, 14));
    assert.deepEqual(
      keysOf(out, 't', 'transform.x').map((k) => [k.t, k.v]),
      [
        [7, 300],
        [8, 100],
        [9, 500],
      ],
    );
    const onto = ok(E.moveKeyframe(start, 't', 'transform.x', 11, 13));
    assert.deepEqual(
      keysOf(onto, 't', 'transform.x').map((k) => [k.t, k.v]),
      [
        [7, 100],
        [9, 500],
      ],
    );
    const outside = ok(E.moveKeyframe(start, 't', 'transform.x', 15, 40));
    near(keysOf(outside, 't', 'transform.x')[2].t, 34, 'a key may sit outside the clip');
    assert.equal(E.moveKeyframe(start, 't', 'transform.x', 12, 14), start, 'no key there');
    assert.equal(E.moveKeyframe(start, 't', 'transform.x', 11, 11), start);
  });

  it('setKeyframeEase changes the easing of the segment that leaves a key', () => {
    const start = keyed();
    const out = ok(E.setKeyframeEase(start, 't', 'transform.x', 11, 'hold'));
    assert.equal(keysOf(out, 't', 'transform.x')[0].ease, 'hold');
    assert.equal(xAt(out, 12.9), 100);
    assert.equal(E.setKeyframeEase(start, 't', 'transform.x', 11, 'wobble'), start);
    assert.equal(E.setKeyframeEase(out, 't', 'transform.x', 11, 'hold'), out);
  });

  it('…At operations work on every key a clip has at a time', () => {
    const start = keyed();
    const moved = ok(E.moveKeyframesAt(start, 't', 13, 12));
    assert.deepEqual(E.keyframeTimes(clipOf(moved, 't')), [11, 12, 15]);
    assert.equal(keysOf(moved, 't', 'transform.opacity')[0].t, 6);
    const only = ok(E.moveKeyframesAt(start, 't', 13, 12, ['transform.opacity']));
    assert.deepEqual(E.keyframeTimes(clipOf(only, 't')), [11, 12, 13, 15]);
    const gone = ok(E.removeKeyframesAt(start, 't', 13));
    assert.deepEqual(Object.keys(clipOf(gone, 't').keyframes), ['transform.x']);
    assert.deepEqual(E.keyframeTimes(clipOf(gone, 't')), [11, 15]);
  });

  it('clearKeyframes drops one path or all, back to the plain values', () => {
    const start = keyed();
    const one = ok(E.clearKeyframes(start, 't', 'transform.x'));
    assert.deepEqual(Object.keys(clipOf(one, 't').keyframes), ['transform.opacity']);
    assert.equal(clipOf(one, 't').transform.x, 50);
    const all = ok(E.clearKeyframes(start, 't'));
    assert.deepEqual(clipOf(all, 't').keyframes, {});
    assert.equal(E.clearKeyframes(all, 't'), all);
    assert.equal(E.clearKeyframes(start, 't', 'volume'), start);
  });
});
