import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEdl } from './factory.js';
import { validateEdl } from './validate.js';
import { testClip, testEdl } from './testkit.js';

/** Paths (or messages) of the problems found after applying `mutate` to a valid document. */
function problemsAfter(mutate, opts) {
  const edl = structuredClone(
    testEdl({
      v1: [
        testClip('a', 0, 5, { fadeOut: 1, linkedClipId: 'a_s' }),
        testClip('b', 4, 9, { fadeIn: 1 }),
        testClip('still', 12, 15, { sourceFile: '/media/still.png', sourceIn: 0, sourceOut: 0 }),
      ],
      a1: [testClip('a_s', 0, 5, { linkedClipId: 'a' })],
    }),
  );
  edl.markers = [
    { markerId: 'm1', time: 1, label: '', color: '' },
    { markerId: 'm2', time: 2, label: '', color: '' },
  ];
  assert.deepEqual(validateEdl(edl), { valid: true, problems: [] }, 'fixture must be valid');
  mutate(edl, edl.tracks[0].clips, edl.tracks);
  return validateEdl(edl, opts).problems;
}
const paths = (mutate, opts) => problemsAfter(mutate, opts).map((problem) => problem.path);
const messages = (mutate, opts) =>
  problemsAfter(mutate, opts)
    .map((problem) => problem.message)
    .join('\n');

describe('validateEdl — document and tracks', () => {
  it('accepts an empty timeline and reports nothing', () => {
    assert.deepEqual(validateEdl(createEdl()), { valid: true, problems: [] });
  });

  it('rejects things that are not documents without throwing', () => {
    for (const junk of [null, 5, 'x', [], {}]) assert.equal(validateEdl(junk).valid, false);
    assert.deepEqual(
      validateEdl({}).problems.map((p) => p.path),
      ['version', 'fps', 'resolution', 'markers', 'tracks'],
    );
  });

  it('checks the head fields', () => {
    assert.deepEqual(
      paths((edl) => (edl.version = 1)),
      ['version'],
    );
    assert.deepEqual(
      paths((edl) => (edl.fps = 0)),
      ['fps'],
    );
    assert.deepEqual(
      paths((edl) => (edl.fps = '30')),
      ['fps'],
    );
    assert.deepEqual(
      paths((edl) => (edl.resolution = '1080p')),
      ['resolution'],
    );
  });

  it('checks track fields, unique ids and video-above-audio order', () => {
    assert.deepEqual(
      paths((_, __, tracks) => (tracks[0].type = 'midi')),
      ['tracks[0].type', 'tracks'],
    );
    assert.deepEqual(
      paths((_, __, tracks) => (tracks[1].trackId = 'v1')),
      ['tracks[1].trackId'],
    );
    assert.deepEqual(
      paths((_, __, tracks) => (tracks[0].locked = 'no')),
      ['tracks[0].locked'],
    );
    assert.deepEqual(
      paths((_, __, tracks) => (tracks[1].volume = 3)),
      ['tracks[1].volume'],
    );
    assert.deepEqual(
      paths((_, __, tracks) => (tracks[0].clips = null)),
      ['tracks[0].clips', 'tracks[1].clips[0].linkedClipId'],
    );
    assert.deepEqual(
      paths((_, __, tracks) => tracks.reverse()),
      ['tracks[1]'],
    );
    assert.match(
      messages((_, __, tracks) => tracks.pop()),
      /at least one audio track/,
    );
  });

  it('checks markers', () => {
    assert.deepEqual(
      paths((edl) => (edl.markers[1].markerId = 'm1')),
      ['markers[1].markerId'],
    );
    assert.deepEqual(
      paths((edl) => (edl.markers[0].time = -1)),
      ['markers[0].time'],
    );
    assert.deepEqual(
      paths((edl) => (edl.markers[1].time = 0.5)),
      ['markers[1]'],
    );
    assert.deepEqual(
      paths((edl) => (edl.markers[0].label = null)),
      ['markers[0].label'],
    );
  });
});

describe('validateEdl — clips', () => {
  it('checks field types and nested blocks', () => {
    assert.deepEqual(
      paths((_, clips) => (clips[2].clipId = '')),
      ['tracks[0].clips[2].clipId'],
    );
    assert.deepEqual(
      paths((_, clips) => (clips[2].label = 7)),
      ['tracks[0].clips[2].label'],
    );
    assert.deepEqual(
      paths((_, clips) => (clips[2].volume = '1')),
      ['tracks[0].clips[2].volume'],
    );
    assert.deepEqual(
      paths((_, clips) => delete clips[2].text),
      ['tracks[0].clips[2].text'],
    );
    assert.deepEqual(
      paths((_, clips) => (clips[2].transform.fit = 'stretch')),
      ['tracks[0].clips[2].transform.fit'],
    );
    assert.deepEqual(
      paths((_, clips) => (clips[2].transform.opacity = NaN)),
      ['tracks[0].clips[2].transform.opacity'],
    );
    assert.deepEqual(
      paths((_, clips) => delete clips[2].transform.kenBurns.enabled),
      ['tracks[0].clips[2].transform.kenBurns.enabled'],
    );
    assert.deepEqual(
      paths((_, clips) => (clips[2].text.align = 'middle')),
      ['tracks[0].clips[2].text.align'],
    );
    assert.deepEqual(
      paths((_, clips) => (clips[2] = 'clip')),
      ['tracks[0].clips[2]'],
    );
  });

  it('invariant 1: video/audio duration equals the source range; images are free', () => {
    assert.match(
      messages((_, clips) => (clips[1].sourceOut += 0.5)),
      /invariant 1/,
    );
    assert.deepEqual(
      paths((_, clips) => (clips[2].sourceOut = 99)),
      [],
    );
  });

  it('invariant 2: time bounds, and the source duration when it is known', () => {
    assert.deepEqual(
      paths((_, clips) => (clips[2].timelineStart = NaN)),
      ['tracks[0].clips[2].timelineStart'],
    );
    assert.deepEqual(
      paths((_, clips) => Object.assign(clips[2], { timelineStart: 16 })),
      ['tracks[0].clips[2].timelineEnd'],
    );
    assert.deepEqual(
      paths((_, clips) => Object.assign(clips[0], { sourceIn: -1, sourceOut: 4 })),
      ['tracks[0].clips[0].sourceIn'],
    );
    const sourceDurations = new Map([['/media/b.mp4', 4]]);
    assert.match(
      messages(() => {}, { sourceDurations }),
      /exceeds the source duration \(invariant 2\)/,
    );
    assert.deepEqual(
      paths(() => {}, { sourceDurations: { '/media/b.mp4': 5 } }),
      [],
    );
  });

  it('invariant 3: fades fit in the clip and are not negative', () => {
    assert.match(
      messages((_, clips) => (clips[2].fadeIn = 2.5) && (clips[2].fadeOut = 1)),
      /invariant 3/,
    );
    assert.deepEqual(
      paths((_, clips) => (clips[2].fadeIn = -1)),
      ['tracks[0].clips[2].fadeIn'],
    );
  });

  it('invariant 4: an overlap must be a cross-fade pair', () => {
    assert.match(
      messages((_, clips) => (clips[0].fadeOut = 0.5)),
      /not a cross-fade/,
    );
    assert.match(
      messages((_, clips) => (clips[1].fadeIn = 0)),
      /not a cross-fade/,
    );
    assert.match(
      messages((_, clips) =>
        Object.assign(clips[1], { timelineStart: 1, timelineEnd: 3, sourceOut: 2 }),
      ),
      /inside or over the previous clip/,
    );
    assert.match(
      messages((_, clips) => Object.assign(clips[2], { timelineStart: 4.5, timelineEnd: 7.5 })),
      /three clips overlap/,
    );
  });

  it('clips must be sorted and ids unique across the document', () => {
    assert.match(
      messages((_, clips) => clips.reverse()),
      /sorted/,
    );
    assert.deepEqual(
      paths((_, clips) => (clips[2].clipId = 'a_s')),
      ['tracks[1].clips[0].clipId'],
    );
  });

  it('invariant 5: links are symmetric and point at existing clips', () => {
    assert.match(
      messages((_, clips) => (clips[2].linkedClipId = 'a')),
      /not symmetric/,
    );
    assert.match(
      messages((_, clips) => (clips[2].linkedClipId = 'ghost')),
      /missing clip/,
    );
    assert.match(
      messages((_, clips) => (clips[2].linkedClipId = 'still')),
      /missing clip/,
    );
    assert.deepEqual(
      paths((_, clips) => (clips[0].linkedClipId = '')),
      ['tracks[1].clips[0].linkedClipId'],
    );
  });

  it('invariant 4: a clip that shares an edge with its neighbour is not a cross-fade', () => {
    const shared = (a, b) => validateEdl(testEdl({ v1: [a, b] })).valid;
    assert.equal(
      shared(testClip('a', 0, 5, { fadeOut: 1 }), testClip('b', 4, 5, { fadeIn: 1 })),
      false,
    );
    assert.equal(
      shared(testClip('a', 4, 5, { fadeOut: 1 }), testClip('b', 4, 8, { fadeIn: 1 })),
      false,
    );
    assert.equal(
      shared(testClip('a', 4, 5, { fadeOut: 1 }), testClip('b', 4, 5, { fadeIn: 1 })),
      false,
    );
    assert.equal(
      shared(testClip('a', 0, 5, { fadeOut: 1 }), testClip('b', 4, 8, { fadeIn: 1 })),
      true,
    );
  });
});
