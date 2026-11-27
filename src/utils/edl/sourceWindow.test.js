import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const key = (t, v, ease = 'linear') => ({ t, v, ease });
const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, `${why || ''} ${a} ≉ ${b}`);

/** Keyframes that move x from 0 to 800 and the glow radius from 40 to 0 over the clip. */
const animation = (sourceIn) => ({
  effects: [{ effectId: 'fx', type: 'glow', enabled: true, params: { radius: 5 } }],
  keyframes: {
    'transform.x': [key(sourceIn, 0), key(sourceIn + 8, 800)],
    'effects.fx.radius': [key(sourceIn, 40, 'ease-out'), key(sourceIn + 8, 0)],
  },
});

/** One clip of every free kind at 2–10 on its own track, plus media on v1/a1. */
const doc = () =>
  deepFreeze(
    assertValid(
      testEdl({
        v5: [
          testClip('gen', 2, 10, {
            sourceFile: '',
            generator: { type: 'gradient', seed: 3, params: { angle: 0 } },
            ...animation(0),
            keyframes: {
              ...animation(0).keyframes,
              'generator.params.angle': [key(0, 0), key(8, 360)],
            },
          }),
        ],
        v4: [
          testClip('title', 2, 10, { sourceFile: '', text: { content: 'Hi' }, ...animation(0) }),
        ],
        v3: [testClip('still', 2, 10, { sourceFile: '/m/still.png', ...animation(0) })],
        v2: [testClip('ph', 2, 10, { sourceFile: '', placeholder: true, ...animation(0) })],
        v1: [
          testClip('vid', 2, 10, {
            sourceIn: 20,
            sourceOut: 28,
            linkedClipId: 'snd',
            ...animation(20),
          }),
        ],
        a1: [
          testClip('snd', 2, 10, {
            sourceFile: '/media/vid.mp4',
            sourceIn: 20,
            sourceOut: 28,
            linkedClipId: 'vid',
          }),
        ],
      }),
    ),
  );
const ALL = ['gen', 'title', 'still', 'ph', 'vid'];

/** What the compositor would read for a clip at a timeline time. */
function seen(edl, clipId, time) {
  const clip = E.resolveClip(clipOf(edl, clipId), time);
  return {
    x: clip.transform.x,
    radius: clip.effects[0].params.radius,
    angle: clip.generator.params.angle,
    local: E.clipLocalTime(clip, time),
  };
}

/** Assert that `after` shows, at each time, what `before` showed at time + shift. */
function assertSamePicture(before, after, pairs, times, shift = 0) {
  for (const [beforeId, afterId] of pairs) {
    for (const time of times) {
      const was = seen(before, beforeId, time + shift);
      const is = seen(after, afterId, time);
      for (const field of ['x', 'radius', 'local'])
        near(is[field], was[field], `${afterId} ${field} @${time}`);
      if (was.angle !== undefined) near(is.angle, was.angle, `${afterId} angle @${time}`);
    }
  }
}
const same = (ids) => ids.map((id) => [id, id]);

describe('source windows — every clip keeps one', () => {
  it('the fixture animates: values change over time and differ between ends', () => {
    assert.deepEqual(seen(doc(), 'gen', 6), { x: 400, radius: 5, angle: 180, local: 4 });
    assert.equal(seen(doc(), 'vid', 6).local, 24);
  });

  it('trimming the start moves sourceIn; what is on screen at any time does not change', () => {
    const start = doc();
    let out = start;
    for (const id of ALL) out = E.trimClipStart(out, id, 5);
    assertValid(out);
    for (const id of ALL) assert.equal(clipOf(out, id).timelineStart, 5, id);
    assert.deepEqual(
      ALL.map((id) => clipOf(out, id).sourceIn),
      [3, 3, 3, 3, 23],
    );
    assert.equal(clipOf(out, 'snd').sourceIn, 23, 'the linked partner follows');
    assertSamePicture(doc(), out, same(ALL), [5, 6.5, 9.9]);
    assert.equal(clipOf(out, 'gen').keyframes, clipOf(start, 'gen').keyframes, 'keys untouched');
  });

  it('extending the start reveals earlier source time: below 0 for free clips, never for media', () => {
    let out = doc();
    for (const id of ALL) out = E.trimClipStart(out, id, 0);
    assertValid(out);
    assert.deepEqual(
      ALL.map((id) => [clipOf(out, id).timelineStart, clipOf(out, id).sourceIn]),
      [
        [0, -2],
        [0, -2],
        [0, -2],
        [0, -2],
        [0, 18],
      ],
    );
    assertSamePicture(doc(), out, same(ALL), [2, 6, 9]);
    assert.equal(seen(out, 'gen', 0).x, 0, 'before the first key the first value holds');
    const tight = testEdl({ v1: [testClip('m', 5, 9, { sourceIn: 1, sourceOut: 5 })] });
    const held = assertValid(E.trimClipStart(tight, 'm', 0));
    assert.deepEqual([clipOf(held, 'm').timelineStart, clipOf(held, 'm').sourceIn], [4, 0]);
  });

  it('trimming the end and a ripple trim of the start keep the picture too', () => {
    let out = doc();
    for (const id of ALL) out = E.trimClipEnd(out, id, 7);
    assertSamePicture(doc(), assertValid(out), same(ALL), [2, 4, 6.9]);
    const rippled = assertValid(E.trimClipStart(doc(), 'gen', 5, { ripple: true }));
    const gen = clipOf(rippled, 'gen');
    assert.deepEqual([gen.timelineStart, gen.timelineEnd, gen.sourceIn], [2, 7, 3]);
    assertSamePicture(doc(), rippled, [['gen', 'gen']], [2, 4, 6.9], 3);
  });

  it('slipping shifts the window: free clips without limit, media inside its source', () => {
    const sourceDurations = { '/media/vid.mp4': 30 };
    let out = doc();
    for (const id of ALL) out = E.slipClip(out, id, 1.5, { sourceDurations });
    assertValid(out, { sourceDurations });
    assert.deepEqual(layout(out), layout(doc()), 'nothing moves on the timeline');
    assertSamePicture(doc(), out, same(ALL), [2, 5, 8], 1.5);
    const far = E.slipClip(doc(), 'title', -50);
    assert.deepEqual([clipOf(far, 'title').sourceIn, clipOf(far, 'title').sourceOut], [-50, -42]);
    const stopped = E.slipClip(doc(), 'vid', 50, { sourceDurations });
    assert.deepEqual(
      [clipOf(stopped, 'vid').sourceOut, clipOf(stopped, 'snd').sourceOut],
      [30, 30],
    );
  });

  it('splitting gives the right half the later window; both halves keep keys and effects', () => {
    const out = assertValid(E.splitClips(doc(), 6));
    const rights = Object.fromEntries(
      out.tracks.map((track) => [track.clips[0].clipId, track.clips[1].clipId]),
    );
    for (const id of ALL) {
      const [left, right] = [clipOf(out, id), clipOf(out, rights[id])];
      assert.deepEqual([left.timelineEnd, right.timelineStart], [6, 6], id);
      assert.equal(right.sourceIn, left.sourceIn + 4, id);
      assert.equal(right.keyframes, left.keyframes, 'the full key lists, shared');
      assert.equal(right.effects, left.effects, 'the full stack; ids are unique per clip');
    }
    assertSamePicture(doc(), out, same(ALL), [2, 4, 5.99]);
    const pairs = ALL.map((id) => [id, rights[id]]);
    assertSamePicture(doc(), out, pairs, [6, 8, 9.99]);
    const edited = E.setKeyframe(out, rights.gen, 'transform.x', 8, 5);
    assert.equal(seen(edited, 'gen', 5).x, 300, 'the halves are independent afterwards');
  });

  it('an overwrite cut keeps the remnants attached (cross-fade off)', () => {
    const cover = testClip('cover', 4, 7, { sourceFile: '/m/cover.png' });
    const start = E.pasteClips(doc(), E.copyClips(testEdl({ v1: [cover] }), ['cover']), {
      time: 20,
    });
    const coverId = E.newClipIds(doc(), start)[0];
    const lane = start.tracks.find((t) => t.clips.some((c) => c.clipId === coverId)).trackId;
    const moved = E.moveClips(start, ['title'], { toTrackId: lane, autoCrossfade: false });
    const out = assertValid(
      E.moveClips(moved, [coverId], { delta: -16, toTrackId: lane, autoCrossfade: false }),
    );
    const pieces = out.tracks.find((t) => t.trackId === lane).clips.filter((c) => c.text.content);
    assert.deepEqual(
      pieces.map((c) => [c.timelineStart, c.timelineEnd, c.sourceIn]),
      [
        [2, 4, 0],
        [7, 10, 5],
      ],
    );
    assertSamePicture(doc(), out, [['title', pieces[0].clipId]], [2, 3.5]);
    assertSamePicture(doc(), out, [['title', pieces[1].clipId]], [7, 9.5]);
  });

  it('copy, paste, duplicate and moving carry everything and keep the animation in place', () => {
    const copy = E.copyClips(doc(), ALL);
    const out = assertValid(E.pasteClips(doc(), JSON.parse(JSON.stringify(copy)), { time: 30 }));
    const ids = E.newClipIds(doc(), out);
    assert.equal(ids.length, ALL.length);
    for (const id of ids) {
      const pasted = clipOf(out, id);
      const from = ALL.map((name) => clipOf(doc(), name)).find(
        (clip) => E.clipKind(clip) === E.clipKind(pasted) && clip.sourceFile === pasted.sourceFile,
      );
      assert.deepEqual(pasted.keyframes, from.keyframes);
      assert.deepEqual(pasted.effects, from.effects);
      assert.deepEqual(pasted.generator, from.generator);
      assertSamePicture(doc(), out, [[from.clipId, id]], [30, 33, 37.5], -28);
    }
    const twice = assertValid(E.duplicateClips(doc(), ['gen']));
    const twin = clipOf(twice, E.newClipIds(doc(), twice)[0]);
    assert.deepEqual([twin.timelineStart, twin.sourceIn, twin.blendMode], [10, 0, 'normal']);
    assert.deepEqual(twin.keyframes, clipOf(doc(), 'gen').keyframes);
    const shifted = assertValid(E.moveClips(doc(), ['gen'], { delta: 3 }));
    assertSamePicture(doc(), shifted, [['gen', 'gen']], [5, 9, 12], -3);
  });

  it('effects and keyframes are per clip: the linked partner is never given them', () => {
    let out = E.setKeyframe(doc(), 'vid', 'transform.rotation', 4, 90);
    out = E.addEffect(out, { clipId: 'vid' }, 'blur');
    out = assertValid(E.splitClips(E.trimClipStart(out, 'vid', 3), 6));
    const audio = out.tracks.find((t) => t.type === 'audio').clips;
    assert.equal(audio.length, 2, 'the partner was trimmed and split along');
    for (const clip of audio) assert.deepEqual([clip.effects, clip.keyframes], [[], {}]);
  });
});
