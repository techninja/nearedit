import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createTrack } from '#utils/edl/factory.js';
import { audioCues, audioSignature, clipsNear, videoCues, videoLayers } from './schedule.js';

const clip = (clipId, timelineStart, timelineEnd, extra = {}) =>
  createClip({
    clipId,
    sourceFile: '/m/a.mp4',
    sourceOut: timelineEnd - timelineStart,
    timelineStart,
    timelineEnd,
    ...extra,
  });
const ids = (cues) => cues.map((cue) => cue.clip.clipId);

describe('clipsNear', () => {
  const track = createTrack('video', { clips: [clip('b', 5, 9), clip('a', 0, 5)] });

  it('returns clips covering the time, end exclusive', () => {
    assert.deepEqual(ids(clipsNear(track, 0).map((c) => ({ clip: c }))), ['a']);
    assert.deepEqual(ids(clipsNear(track, 5).map((c) => ({ clip: c }))), ['b']);
    assert.deepEqual(clipsNear(track, 9), []);
  });

  it('adds clips that start within the lookahead, in start order', () => {
    assert.deepEqual(
      clipsNear(track, 4.5, 1).map((c) => c.clipId),
      ['a', 'b'],
    );
    assert.deepEqual(
      clipsNear(track, 3.9, 1).map((c) => c.clipId),
      ['a'],
    );
  });
});

describe('videoCues / videoLayers', () => {
  const title = createClip({
    clipId: 't',
    timelineStart: 0,
    timelineEnd: 4,
    text: { content: 'Hi' },
  });
  const hole = createClip({ clipId: 'p', timelineStart: 0, timelineEnd: 4, placeholder: true });
  const tracks = [
    createTrack('video', { trackId: 'v1', clips: [title, hole] }),
    createTrack('video', { trackId: 'v2', clips: [clip('front', 0, 4), clip('later', 6, 8)] }),
    createTrack('video', {
      trackId: 'v3',
      clips: [
        clip('still', 0, 4, { sourceFile: '/m/s.png' }),
        clip('song', 0, 4, { sourceFile: '/m/s.mp3' }),
      ],
    }),
    createTrack('audio', { trackId: 'a1', clips: [clip('sound', 0, 4)] }),
  ];

  it('orders layers back to front: last video track first, first video track last', () => {
    assert.deepEqual(ids(videoLayers(tracks, 1)), ['still', 'front', 't']);
  });

  it('classifies kinds and leaves out placeholders, audio files and audio tracks', () => {
    assert.deepEqual(
      videoLayers(tracks, 1).map((cue) => cue.kind),
      ['image', 'video', 'title'],
    );
  });

  it('draws both clips of a cross-fade, earlier one underneath', () => {
    const pair = [
      createTrack('video', {
        clips: [clip('in', 3, 8, { fadeIn: 1 }), clip('out', 0, 4, { fadeOut: 1 })],
      }),
    ];
    assert.deepEqual(ids(videoLayers(pair, 3.5)), ['out', 'in']);
  });

  it('honours mute and solo', () => {
    const muted = tracks.map((t) => (t.trackId === 'v2' ? { ...t, muted: true } : t));
    assert.deepEqual(ids(videoLayers(muted, 1)), ['still', 't']);
    const solo = tracks.map((t) => (t.trackId === 'v3' ? { ...t, solo: true } : t));
    assert.deepEqual(ids(videoLayers(solo, 1)), ['still']);
  });

  it('flags upcoming clips as not yet active', () => {
    const cues = videoCues(tracks, 5.2, 1);
    assert.deepEqual(ids(cues), ['later']);
    assert.equal(cues[0].active, false);
    assert.deepEqual(videoCues(tracks, 4.9, 1), []);
  });

  it('copes with an empty or missing document', () => {
    assert.deepEqual(videoLayers([], 0), []);
    assert.deepEqual(videoLayers(undefined, 0), []);
  });
});

describe('audioCues', () => {
  const tracks = [
    createTrack('video', { trackId: 'v1', clips: [clip('pic', 0, 4)] }),
    createTrack('audio', {
      trackId: 'a1',
      clips: [clip('voice', 0, 4), clip('next', 4.5, 6), clip('gap', 0, 4, { sourceFile: '' })],
    }),
    createTrack('audio', {
      trackId: 'a2',
      clips: [clip('music', 1, 9, { sourceFile: '/m/s.mp3' })],
    }),
  ];

  it('returns every audible clip on every audio track at once', () => {
    assert.deepEqual(ids(audioCues(tracks, 2)), ['voice', 'music']);
    assert.deepEqual(ids(audioCues(tracks, 0.5)), ['voice']);
  });

  it('includes clips due within the lookahead', () => {
    const cues = audioCues(tracks, 0.5, 1);
    assert.deepEqual(ids(cues), ['voice', 'music']);
    assert.deepEqual(
      cues.map((cue) => cue.active),
      [true, false],
    );
    assert.deepEqual(ids(audioCues(tracks, 3.9, 1)), ['voice', 'next', 'music']);
  });

  it('treats the sound of a video file on an audio track as audio', () => {
    assert.equal(audioCues(tracks, 2)[0].kind, 'audio');
  });

  it('honours mute and solo', () => {
    const muted = tracks.map((t) => (t.trackId === 'a1' ? { ...t, muted: true } : t));
    assert.deepEqual(ids(audioCues(muted, 2)), ['music']);
    const solo = tracks.map((t) => (t.trackId === 'a1' ? { ...t, solo: true } : t));
    assert.deepEqual(ids(audioCues(solo, 2)), ['voice']);
  });

  it('skips stills and clips without a source', () => {
    const odd = [createTrack('audio', { clips: [clip('img', 0, 4, { sourceFile: '/m/s.png' })] })];
    assert.deepEqual(audioCues(odd, 1), []);
  });
});

describe('audioSignature', () => {
  const track = createTrack('audio', { volume: 0.8 });
  const base = clip('a', 1, 5, { fadeIn: 0.5 });

  it('is stable for an unchanged clip', () => {
    assert.equal(audioSignature(track, base), audioSignature({ ...track }, { ...base }));
  });

  it('changes when timing, level or source changes', () => {
    const sig = audioSignature(track, base);
    assert.notEqual(audioSignature(track, { ...base, timelineStart: 2, timelineEnd: 6 }), sig);
    assert.notEqual(audioSignature(track, { ...base, fadeOut: 1 }), sig);
    assert.notEqual(audioSignature(track, { ...base, volume: 0.5 }), sig);
    assert.notEqual(audioSignature(track, { ...base, sourceIn: 1 }), sig);
    assert.notEqual(audioSignature({ ...track, volume: 1 }, base), sig);
  });

  it('ignores fields that do not affect sound', () => {
    assert.equal(
      audioSignature(track, { ...base, label: 'x', color: '#f00' }),
      audioSignature(track, base),
    );
  });
});
