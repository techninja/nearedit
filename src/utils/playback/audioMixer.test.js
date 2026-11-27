import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createTrack } from '#utils/edl/factory.js';
import { FakeAudioContext, installFakeAudio } from './testing/fakeAudioContext.js';
import { installFakeElements } from './testing/fakeMediaElement.js';

installFakeAudio();
installFakeElements();
const { createMixer, LEAD_IN } = await import('./audioMixer.js');
const { getAudioGraph } = await import('./audioGraph.js');

const clip = (clipId, sourceFile, timelineStart, timelineEnd, extra = {}) =>
  createClip({
    clipId,
    sourceFile,
    timelineStart,
    timelineEnd,
    sourceIn: 0,
    sourceOut: timelineEnd - timelineStart,
    ...extra,
  });
const audio = (trackId, clips, extra = {}) => createTrack('audio', { trackId, clips, ...extra });
const voiceOf = (mixer, clipId) => mixer.voices().find((v) => v.clipId === clipId);
/** Mark every voice's media as loaded, as the browser would. */
const loadAll = (mixer) => mixer.voices().forEach((v) => (v.el.readyState = 4));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

describe('audio mixer', () => {
  let mixer;
  let ctx;
  const tracks = [
    audio('a1', [clip('voice', '/m/talk.wav', 0, 10, { fadeIn: 2 })]),
    audio(
      'a2',
      [clip('music', '/m/song.mp3', 4, 20, { sourceIn: 30, sourceOut: 46, volume: 0.5 })],
      {
        volume: 0.8,
      },
    ),
  ];

  before(() => {
    assert.equal(createMixer().park(tracks, 5), undefined); // no graph yet: parking is a no-op
    getAudioGraph();
    ctx = FakeAudioContext.last;
  });
  beforeEach(() => {
    mixer = createMixer();
    ctx.state = 'running';
    ctx.currentTime = 100;
  });

  it('plays every audible clip on every audio track at once', () => {
    mixer.update(tracks, 6);
    const [voice, music] = [voiceOf(mixer, 'voice'), voiceOf(mixer, 'music')];
    assert.equal(mixer.voices().length, 2);
    assert.ok(!voice.el.paused && !music.el.paused);
    near(voice.el.currentTime, 6);
    near(music.el.currentTime, 32); // sourceIn 30 + 2 s into the clip
  });

  it('plays compressed audio from the WAV rendition and WAV from the file', () => {
    mixer.update(tracks, 6);
    assert.equal(voiceOf(mixer, 'voice').el.src, '/api/media/file?path=%2Fm%2Ftalk.wav');
    assert.equal(voiceOf(mixer, 'music').el.src, '/api/transcode?path=%2Fm%2Fsong.mp3');
  });

  it('schedules gain = track × clip × fade on the audio clock', () => {
    mixer.update(tracks, 1);
    const events = voiceOf(mixer, 'voice').gain.gain.events;
    assert.deepEqual(events[0], { type: 'set', value: 0.5, time: 100 }); // mid fade-in, now
    assert.deepEqual(events[1], { type: 'ramp', value: 1, time: 101 }); // fade-in ends at 2 s
    assert.deepEqual(events.at(-1), { type: 'set', value: 0, time: 109 }); // closed at the clip end
    mixer.update(tracks, 6);
    assert.equal(voiceOf(mixer, 'music').gain.gain.events[0].value, 0.4);
  });

  it('cues an upcoming clip: loaded, parked before its in-point, gain closed', () => {
    mixer.update(tracks, 3); // music starts at 4
    const music = voiceOf(mixer, 'music');
    assert.ok(music.el.paused);
    near(music.el.currentTime, 30 - LEAD_IN);
    assert.deepEqual(music.gain.gain.events.slice(0, 2), [
      { type: 'set', value: 0, time: 100 },
      { type: 'set', value: 0.4, time: 101 }, // opens exactly at the clip start
    ]);
  });

  it('starts a cued clip early and silent, so it is on time when the gain opens', () => {
    mixer.update(tracks, 3);
    loadAll(mixer);
    mixer.update(tracks, 4 - LEAD_IN + 0.005); // the first frame inside the lead-in
    const music = voiceOf(mixer, 'music');
    assert.ok(!music.el.paused);
    assert.equal(music.el.seeks.length, 1); // no second seek: it started from where it was parked
  });

  it('does not cue clips further away than the lookahead', () => {
    mixer.update(tracks, 1);
    assert.equal(voiceOf(mixer, 'music'), undefined);
  });

  it('gives two clips of the same file their own elements', () => {
    const twice = [
      audio('a1', [clip('one', '/m/a.wav', 0, 10)]),
      audio('a2', [clip('two', '/m/a.wav', 0, 10, { sourceIn: 60, sourceOut: 70 })]),
    ];
    mixer.update(twice, 2);
    const [one, two] = [voiceOf(mixer, 'one'), voiceOf(mixer, 'two')];
    assert.notEqual(one.el, two.el);
    assert.equal(one.el.src, two.el.src);
    assert.ok(!one.el.paused && !two.el.paused);
    near(two.el.currentTime - one.el.currentTime, 60);
  });

  it('honours mute and solo as the document changes, without touching other voices', () => {
    mixer.update(tracks, 6);
    const voice = voiceOf(mixer, 'voice');
    const seeks = voice.el.seeks.length;
    mixer.update([tracks[0], { ...tracks[1], muted: true }], 6.016);
    assert.equal(voiceOf(mixer, 'music'), undefined);
    assert.ok(mixer.voices().some((v) => !v.clipId && v.el.paused)); // idled, kept for reuse
    assert.ok(!voice.el.paused);
    assert.equal(voice.el.seeks.length, seeks);
    mixer.update([tracks[0], { ...tracks[1], solo: true }], 6.032);
    assert.equal(voiceOf(mixer, 'voice'), undefined);
    assert.ok(!voiceOf(mixer, 'music').el.paused);
  });

  it('re-schedules gain when a clip is edited, and only then', () => {
    mixer.update(tracks, 6);
    const param = voiceOf(mixer, 'voice').gain.gain;
    const cancels = param.cancels;
    mixer.update(tracks, 6.016);
    assert.equal(param.cancels, cancels);
    const edited = [audio('a1', [{ ...tracks[0].clips[0], volume: 0.25 }]), tracks[1]];
    mixer.update(edited, 6.032);
    assert.equal(param.cancels, cancels + 1);
    assert.equal(param.events[0].value, 0.25);
  });

  it('re-schedules every gain after the clock jumps (seek, loop)', () => {
    mixer.update(tracks, 6);
    const param = voiceOf(mixer, 'voice').gain.gain;
    const cancels = param.cancels;
    mixer.resync();
    mixer.update(tracks, 8);
    assert.equal(param.cancels, cancels + 1);
  });

  it('nudges a slightly late voice and re-seeks a badly late one', () => {
    mixer.update(tracks, 6, 1000);
    loadAll(mixer);
    const { el } = voiceOf(mixer, 'voice');
    el.time = 6.1 - 0.03; // 30 ms behind, 100 ms later
    mixer.update(tracks, 6.1, 1100);
    assert.ok(el.playbackRate > 1 && el.playbackRate <= 1.05);
    el.time = 5.9; // 300 ms behind: beyond a nudge…
    mixer.update(tracks, 6.2, 1200);
    near(el.currentTime, 5.9); // …but it only just started, and seeks are rate-limited
    mixer.update(tracks, 6.6, 1600);
    near(el.currentTime, 6.6);
    assert.equal(el.playbackRate, 1);
  });

  it('follows a clock jump (seek, loop wrap) at once', () => {
    mixer.update(tracks, 6, 1000);
    loadAll(mixer);
    const { el } = voiceOf(mixer, 'voice');
    el.time = 6.016;
    mixer.update(tracks, 6.016, 1016);
    mixer.update(tracks, 2, 1032); // jumped back 4 s within one frame
    near(el.currentTime, 2);
  });

  it('falls silent while the audio clock is not running', () => {
    mixer.update(tracks, 6);
    ctx.state = 'suspended';
    mixer.update(tracks, 6.016);
    assert.ok(mixer.voices().every((v) => v.el.paused));
  });

  it('parks voices at the playhead while stopped, ready for Play', () => {
    mixer.park(tracks, 6);
    const [voice, music] = [voiceOf(mixer, 'voice'), voiceOf(mixer, 'music')];
    assert.ok(voice.el.paused && music.el.paused);
    near(voice.el.currentTime, 6);
    near(music.el.currentTime, 32);
    loadAll(mixer);
    mixer.voices().forEach((v) => (v.el.seeking = false));
    mixer.update(tracks, 6);
    assert.ok(!voice.el.paused);
    assert.equal(voice.el.seeks.length, 1); // Play did not need another seek
  });

  it('plays fade curves and a keyframed volume, and re-schedules when they change', () => {
    const base = tracks[0].clips[0];
    const curved = [audio('a1', [{ ...base, fadeInCurve: 'smooth' }])];
    mixer.update(curved, 0);
    const param = voiceOf(mixer, 'voice').gain.gain;
    const ramps = param.events.filter((event) => event.type === 'ramp');
    assert.ok(ramps.length > 8, `a curved fade is many short ramps, got ${ramps.length}`);
    const mid = ramps.find((event) => Math.abs(event.time - 100.5) < 0.2);
    assert.ok(mid.value < 0.2, `a smooth fade starts slowly: ${mid.value} a quarter of the way in`);
    const cancels = param.cancels;
    const keyed = {
      ...base,
      keyframes: {
        volume: [
          { t: 0, v: 1 },
          { t: 4, v: 0.5 },
        ],
      },
    };
    mixer.update([audio('a1', [keyed])], 3);
    assert.equal(param.cancels, cancels + 1);
    near(param.events[0].value, 0.625, 1e-6); // volume 0.625 at 3 s, past the fade
    mixer.update([audio('a1', [keyed])], 3.016);
    assert.equal(param.cancels, cancels + 1, 'the same envelope is not scheduled twice');
    const louder = {
      ...keyed,
      keyframes: {
        volume: [
          { t: 0, v: 1 },
          { t: 4, v: 1 },
        ],
      },
    };
    mixer.update([audio('a1', [louder])], 3.032);
    assert.equal(param.cancels, cancels + 2);
  });

  it('pauses on demand and frees every element on release', () => {
    mixer.update(tracks, 6);
    const elements = mixer.voices().map((v) => v.el);
    mixer.pause();
    assert.ok(elements.every((el) => el.paused));
    mixer.release();
    assert.equal(mixer.voices().length, 0);
    assert.ok(elements.every((el) => el.src === ''));
  });
});
