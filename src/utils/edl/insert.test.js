import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clipKind, createEdl } from './factory.js';
import { insertMedia, insertTitle } from './insert.js';
import { newClipIds } from './selection.js';
import { addTrack, toggleTrackLock } from './trackOps.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

const video = { filename: 'park.mp4', filePath: '/abs/park.mp4', type: 'video', duration: 14.08, hasAudio: true };
const song = { filename: 'song.mp3', filePath: '/abs/song.mp3', type: 'audio', duration: 180 };
const photo = { filename: 'kid.jpg', filePath: '/abs/kid.jpg', type: 'image', duration: 0 };
const spans = (edl, trackId) => layout(edl)[trackId].map((s) => s.split(' ')[1]);
const created = (before, after) => newClipIds(before, after).map((id) => clipOf(after, id));

describe('insertMedia', () => {
  it('a video with sound becomes a video clip plus a linked audio clip', () => {
    const start = deepFreeze(createEdl());
    const out = assertValid(insertMedia(start, video), { sourceDurations: { '/abs/park.mp4': 14.08 } });
    const [picture, sound] = created(start, out);
    assert.deepEqual([picture.sourceFile, picture.label], ['/abs/park.mp4', 'park.mp4']);
    assert.equal(picture.linkedClipId, sound.clipId);
    assert.equal(sound.linkedClipId, picture.clipId);
    assert.equal(clipKind(sound, out.tracks[1]), 'audio');
    // 14.08 s is not on the 30 fps grid: the clip ends on the last whole frame.
    assert.ok(Math.abs(picture.timelineEnd - 14 - 2 / 30) < 1e-9);
    assert.ok(picture.sourceOut <= 14.08);
    assert.deepEqual([sound.timelineStart, sound.timelineEnd], [picture.timelineStart, picture.timelineEnd]);
  });

  it('appends at the end of the target tracks by default, or goes where it is told', () => {
    const start = deepFreeze(
      testEdl({ v1: [testClip('x', 0, 4)], a1: [testClip('long', 0, 9)] }),
    );
    const appended = assertValid(insertMedia(start, { ...video, duration: 2 }));
    assert.deepEqual(spans(appended, 'v1'), ['0-4', '9-11'], 'after the longer of the two tracks');
    assert.deepEqual(spans(appended, 'a1'), ['0-9', '9-11']);
    const placed = assertValid(insertMedia(start, { ...video, duration: 2, hasAudio: false }, { time: 20.01 }));
    assert.deepEqual(spans(placed, 'v1'), ['0-4', '20-22']);
    assert.deepEqual(spans(placed, 'a1'), ['0-9']);
  });

  it('audio goes to an audio track, images get a free 5 s', () => {
    const start = deepFreeze(createEdl());
    const withSong = assertValid(insertMedia(start, song, { sourceIn: 30, sourceOut: 40 }));
    assert.deepEqual(layout(withSong).v1, []);
    const [clip] = created(start, withSong);
    assert.deepEqual([clip.sourceIn, clip.sourceOut, clip.timelineStart, clip.timelineEnd], [30, 40, 0, 10]);
    const withPhoto = assertValid(insertMedia(start, photo, { time: 3 }));
    assert.deepEqual(spans(withPhoto, 'v1'), ['3-8']);
    assert.deepEqual(layout(withPhoto).a1, []);
    assert.deepEqual(spans(insertMedia(start, photo, { duration: 2 }), 'v1'), ['0-2']);
  });

  it('respects the overlap rules, or ripples when asked', () => {
    const start = deepFreeze(testEdl({ v1: [testClip('x', 0, 4), testClip('y', 4, 8)] }));
    const clip = { ...video, duration: 3, hasAudio: false };
    const faded = assertValid(insertMedia(start, clip, { time: 7 }));
    assert.deepEqual(spans(faded, 'v1'), ['0-4', '4-8', '7-10']);
    assert.equal(clipOf(faded, 'y').fadeOut, 1);
    const hard = assertValid(insertMedia(start, clip, { time: 2, autoCrossfade: false }));
    assert.deepEqual(spans(hard, 'v1'), ['0-2', '2-5', '5-8']);
    const rippled = assertValid(insertMedia(start, clip, { time: 2, ripple: true }));
    assert.deepEqual(spans(rippled, 'v1'), ['0-2', '2-5', '5-7', '7-11']);
  });

  it('pairs video and audio tracks by their distance from the divider', () => {
    let start = addTrack(addTrack(createEdl(), 'video', { trackId: 'v2' }), 'audio', { trackId: 'a2' });
    start = deepFreeze(start);
    const upper = assertValid(insertMedia(start, video, { trackId: 'v2' }));
    assert.deepEqual([layout(upper).v2.length, layout(upper).a2.length, layout(upper).a1.length], [1, 1, 0]);
    const lower = insertMedia(start, video);
    assert.deepEqual([layout(lower).v1.length, layout(lower).a1.length], [1, 1]);
    const chosen = insertMedia(start, video, { audioTrackId: 'a2' });
    assert.deepEqual([layout(chosen).v1.length, layout(chosen).a2.length], [1, 1]);
    const silent = insertMedia(start, video, { withAudio: false });
    assert.deepEqual([layout(silent).a1.length, created(start, silent)[0].linkedClipId], [0, '']);
  });

  it('never writes to a locked track: the next free one is used, or a new one', () => {
    const start = deepFreeze(toggleTrackLock(toggleTrackLock(createEdl(), 'v1'), 'a1'));
    const out = assertValid(insertMedia(start, video, { trackId: 'v1' }));
    assert.equal(out.tracks.length, 4);
    assert.deepEqual([layout(out).v1, layout(out).a1], [[], []]);
    assert.equal(out.tracks[0].clips.length, 1);
    assert.equal(out.tracks[3].clips.length, 1);
  });

  it('ignores things that cannot be placed', () => {
    const start = deepFreeze(createEdl());
    assert.equal(insertMedia(start, { filePath: '/abs/notes.md', type: 'text' }), start);
    assert.equal(insertMedia(start, null), start);
    assert.equal(insertMedia(start, { ...video, duration: 0.01 }), start, 'shorter than a frame');
    const unknown = insertMedia(start, { ...video, duration: undefined, hasAudio: false });
    assert.deepEqual(spans(unknown, 'v1'), ['0-5'], 'unknown duration falls back to 5 s');
  });
});

describe('insertTitle', () => {
  it('goes on the front-most video track when that is free', () => {
    const start = deepFreeze(testEdl({ v2: [], v1: [testClip('x', 0, 10)] }));
    const out = assertValid(insertTitle(start, { text: 'Ice cream!\nsecond line', time: 2, duration: 3 }));
    const [title] = created(start, out);
    assert.deepEqual(spans(out, 'v2'), ['2-5']);
    assert.equal(clipKind(title, out.tracks[0]), 'title');
    assert.deepEqual([title.text.content, title.label, title.intent], ['Ice cream!\nsecond line', 'Ice cream!', 'title']);
    assert.equal(out.tracks.length, start.tracks.length);
  });

  it('creates a track on top when the front-most one is busy or locked', () => {
    const start = deepFreeze(createEdl({ tracks: testEdl({ v1: [testClip('x', 0, 10)] }).tracks }));
    const out = assertValid(insertTitle(start, { text: 'Hello', time: 2, duration: 3 }));
    assert.equal(out.tracks.length, 3);
    assert.equal(out.tracks[0].name, 'Video 2');
    assert.deepEqual(out.tracks[0].clips.map((c) => c.text.content), ['Hello']);
    assert.equal(out.tracks[1], start.tracks[0], 'the picture underneath is untouched');
    const again = assertValid(insertTitle(out, { text: 'Later', time: 6 }));
    assert.equal(again.tracks.length, 3, 'the new track is reused while it has room');
    const locked = deepFreeze(toggleTrackLock(testEdl({ v2: [], v1: [] }), 'v2'));
    assert.equal(insertTitle(locked, { text: 'Hi' }).tracks.length, 4);
  });

  it('an explicit track is used as is, under the overlap rules', () => {
    const start = deepFreeze(testEdl({ v1: [testClip('x', 0, 10)] }));
    const out = assertValid(insertTitle(start, { text: 'Card', time: 4, duration: 2, trackId: 'v1' }));
    assert.deepEqual(spans(out, 'v1'), ['0-4', '4-6', '6-10']);
  });

  it('accepts a styled text block and refuses an empty title', () => {
    const start = deepFreeze(createEdl());
    const out = insertTitle(start, { text: { content: 'Big', fontSize: 120, align: 'left', bogus: 1 } });
    const [title] = created(start, out);
    assert.deepEqual([title.text.fontSize, title.text.align, title.text.bogus], [120, 'left', undefined]);
    assert.deepEqual([title.timelineStart, title.timelineEnd], [0, 5]);
    assert.equal(insertTitle(start, { text: '' }), start);
    assert.equal(insertTitle(start, {}), start);
  });
});
