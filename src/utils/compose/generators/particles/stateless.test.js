import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, gen } from '../../../../../tests/compose/build.js';
import { draw } from '../../../../../tests/compose/pixels.js';
import { createEnv } from '../../../../api/compose/index.js';
import { slipClip, splitClips, trimClipStart } from '../../../edl/index.js';

/** A layer that uses every moving part at once. */
const BUSY = {
  emitter: 'circle',
  emitterWidth: 0.3,
  emitterHeight: 0.3,
  rate: 150,
  burst: 80,
  burstEvery: 0.6,
  lifetime: 2,
  speed: 260,
  radial: 80,
  gravityY: 300,
  drag: 0.5,
  swirl: 40,
  turbulence: 120,
  sprite: 'star',
  size: 60,
  sizeEnd: 0.3,
  rotationSpread: 360,
  spinSpread: 300,
  flip: 1,
  colors: 3,
  twinkle: 0.5,
  density: 0.9,
};
const scene = (params = BUSY, extra = {}, seed = 11) =>
  doc([
    [gen('p', 'particles', params, { generator: { type: 'particles', seed, params }, ...extra })],
  ]);
/** The bytes of a frame. */
const frame = (edl, time, options) => Buffer.from(draw(edl, time, options).data);
const same = (a, b, message) => assert.ok(a.equals(b), message);
const lit = (bytes) => bytes.some((value, i) => i % 4 < 3 && value > 30);

describe('determinism', () => {
  const edl = scene();
  const times = [0.2, 0.7, 1.3, 2.05, 2.9, 3.6];

  it('draws a frame the same twice, and after any other frames', () => {
    const first = frame(edl, 1.3);
    assert.ok(lit(first), 'the frame is not empty');
    same(frame(edl, 1.3), first, 'twice in a row');
    for (const t of [3.9, 0.1, 2.2]) frame(edl, t);
    frame(scene({ ...BUSY, sprite: 'heart', color1: '#ff0000' }), 1.3);
    same(frame(edl, 1.3), first, 'after other frames and another layer');
  });

  it('draws frames in reverse order as it draws them forward', () => {
    const forward = times.map((t) => frame(edl, t));
    for (let i = times.length - 1; i >= 0; i--) {
      same(frame(edl, times[i]), forward[i], `frame at ${times[i]} s drawn backwards`);
    }
    assert.ok(!forward[2].equals(forward[3]), 'the layer does move');
  });

  it('draws frame 100 without frames 0 to 99', () => {
    const warmed = createEnv();
    for (let n = 0; n < 100; n++) frame(edl, n / 30, { env: warmed });
    const after = frame(edl, 100 / 30, { env: warmed });
    same(
      frame(edl, 100 / 30, { env: createEnv() }),
      after,
      'alone, on a canvas that drew nothing before',
    );
  });

  it('gives each seed its own picture', () => {
    same(frame(scene(BUSY, {}, 5), 1), frame(scene(BUSY, {}, 5), 1));
    assert.ok(!frame(scene(BUSY, {}, 5), 1).equals(frame(scene(BUSY, {}, 6), 1)));
  });
});

describe('statelessness: the clip-local time base', () => {
  const edl = scene();

  it('continues seamlessly across a split', () => {
    const cut = splitClips(edl, 1.7);
    const [left, right] = cut.tracks[0].clips;
    assert.equal(cut.tracks[0].clips.length, 2);
    assert.equal(right.sourceIn, 1.7);
    for (const t of [0.4, 1.6]) same(frame(cut, t), frame(edl, t), `left half at ${t} s`);
    for (const t of [1.7, 1.75, 2.6, 3.95])
      same(frame(cut, t), frame(edl, t), `right half at ${t} s`);
    // The right half on its own, with the left half gone, is still the same.
    const alone = { ...cut, tracks: [{ ...cut.tracks[0], clips: [right] }, cut.tracks[1]] };
    same(frame(alone, 2.6), frame(edl, 2.6), 'right half alone');
    assert.equal(left.generator.seed, right.generator.seed);
  });

  it('keeps its motion when the start is trimmed', () => {
    const trimmed = trimClipStart(edl, 'p', 1.2);
    assert.equal(trimmed.tracks[0].clips[0].sourceIn, 1.2);
    for (const t of [1.2, 2, 3.3]) same(frame(trimmed, t), frame(edl, t), `at ${t} s`);
    assert.ok(!lit(frame(trimmed, 0.8)), 'nothing before the trimmed start');
  });

  it('moves through the same motion when the clip is slipped', () => {
    const slipped = slipClip(edl, 'p', 1);
    assert.equal(slipped.tracks[0].clips[0].sourceIn, 1);
    for (const t of [0, 0.9, 2.5]) same(frame(slipped, t), frame(edl, t + 1), `at ${t} s`);
  });

  it('shows the same thing wherever the clip sits on the timeline', () => {
    const later = scene(BUSY, { timelineStart: 10, timelineEnd: 14 });
    for (const t of [0.3, 2.2]) same(frame(later, 10 + t), frame(edl, t), `${t} s into the clip`);
  });

  it('is empty before its clip-local zero, unless it is prewarmed', () => {
    const early = { sourceIn: -2, sourceOut: 2 };
    const steady = { ...BUSY, burst: 0 };
    assert.ok(!lit(frame(scene(steady, early), 1)), 'one second before emission starts');
    assert.ok(lit(frame(scene(steady, early), 2.5)));
    const warm = { ...steady, prewarm: true };
    assert.ok(lit(frame(scene(warm, early), 1)), 'a prewarmed field has always been running');
    assert.ok(lit(frame(scene(warm), 0)), 'and is full on the first frame');
    assert.ok(!lit(frame(scene(steady), 0)));
    // Once the cold start has caught up, both show the same particles.
    same(frame(scene(warm), 3.5), frame(scene(steady), 3.5));
  });
});
