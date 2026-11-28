import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBTITLE_GROUP,
  captionVoices,
  formatSrt,
  formatTimestamp,
  formatVtt,
  timelineCues,
  voiceWords,
  voicesAt,
} from './index.js';

/** A clip playing `length` seconds of its file from `sourceIn`, placed at `start`. */
const clip = (clipId, start, length, sourceIn = 0, extra = {}) => ({
  clipId,
  sourceFile: '/project/talk.mp4',
  sourceIn,
  sourceOut: sourceIn + length,
  timelineStart: start,
  timelineEnd: start + length,
  linkedClipId: '',
  ...extra,
});
const track = (trackId, type, clips, extra = {}) => ({ trackId, type, clips, ...extra });
const ON = { captions: { on: true } };
/** The transcript of the file: a word every half second from 10 s. */
const TRANSCRIPT = 'Hello there, general Kenobi. You are a bold one.'
  .split(' ')
  .map((word, i) => [10 + i * 0.5, 10.4 + i * 0.5, word]);
const ids = (voices) => voices.map((voice) => [voice.clip.clipId, voice.sound.clipId]);

describe('captionVoices', () => {
  it('finds the captioned clips that are heard', () => {
    const edl = {
      tracks: [
        track('v1', 'video', []),
        track('a1', 'audio', [clip('a', 0, 4, 10, ON), clip('b', 4, 2, 0), clip('c', 6, 2, 0, ON)]),
        track('a2', 'audio', [clip('d', 0, 4, 0, { captions: { on: false } })]),
      ],
    };
    assert.deepEqual(ids(captionVoices(edl)), [
      ['a', 'a'],
      ['c', 'c'],
    ]);
    assert.equal(captionVoices(edl), captionVoices(edl), 'worked out once for a document');
    assert.deepEqual(ids(voicesAt(edl, 3.99)), [['a', 'a']]);
    assert.deepEqual(ids(voicesAt(edl, 4)), [], 'a clip ends before its last instant');
    assert.deepEqual(ids(voicesAt(edl, 6)), [['c', 'c']]);
  });

  it('leaves out a clip on a muted track, and on any other track than a soloed one', () => {
    const tracks = (first, second) => [
      track('a1', 'audio', [clip('a', 0, 4, 0, ON)], first),
      track('a2', 'audio', [clip('b', 0, 4, 0, ON)], second),
    ];
    assert.deepEqual(ids(captionVoices({ tracks: tracks({ muted: true }, {}) })), [['b', 'b']]);
    assert.deepEqual(ids(captionVoices({ tracks: tracks({}, { solo: true }) })), [['b', 'b']]);
    assert.deepEqual(ids(captionVoices({ tracks: tracks({ muted: true }, { muted: true }) })), []);
  });

  it('hears the picture of a linked pair through its sound, once', () => {
    const picture = clip('p', 0, 4, 10, { ...ON, linkedClipId: 's' });
    const pair = (sound, audio = {}) => ({
      tracks: [track('v1', 'video', [picture]), track('a1', 'audio', [sound], audio)],
    });
    const quiet = clip('s', 0.5, 4, 10, { linkedClipId: 'p' });
    assert.deepEqual(ids(captionVoices(pair(quiet))), [['p', 's']], 'on the picture only');
    const both = clip('s', 0, 4, 10, { ...ON, linkedClipId: 'p' });
    assert.deepEqual(ids(captionVoices(pair(both))), [['s', 's']], 'on both: one voice');
    assert.deepEqual(ids(captionVoices(pair(quiet, { muted: true }))), [], 'its sound is muted');
    const alone = { tracks: [track('v1', 'video', [clip('p', 0, 4, 10, ON)])] };
    assert.deepEqual(ids(captionVoices(alone)), [['p', 'p']], 'a picture of its own is shown');
    alone.tracks[0] = track('v1', 'video', [clip('p', 0, 4, 10, ON)], { muted: true });
    assert.deepEqual(
      ids(captionVoices({ tracks: alone.tracks })),
      [],
      'unless its track is hidden',
    );
  });

  it('answers nothing for what is not a document', () => {
    for (const edl of [undefined, null, 'edl', {}, { tracks: 'x' }, { tracks: [null, {}] }]) {
      assert.deepEqual(captionVoices(edl), []);
    }
  });
});

describe('voiceWords', () => {
  it('maps the words a clip plays to where the clip sits', () => {
    // Plays 10.8..12.8 of the file, at 2..4 on the timeline.
    const sound = clip('a', 2, 2, 10.8, ON);
    const words = voiceWords({ clip: sound, sound, track: {} }, TRANSCRIPT);
    assert.deepEqual(
      words.map(([start, end, text]) => [Number(start.toFixed(3)), Number(end.toFixed(3)), text]),
      [
        [2.2, 2.6, 'general'],
        [2.7, 3.1, 'Kenobi.'],
        [3.2, 3.6, 'You'],
        [3.7, 4, 'are'],
      ],
      "a word belongs to the clip when its middle does, and is cut at the clip's ends",
    );
    assert.equal(voiceWords({ clip: sound, sound, track: {} }, TRANSCRIPT), words, 'remembered');
    assert.notEqual(voiceWords({ clip: sound, sound, track: {} }, [...TRANSCRIPT]), words);
  });

  it('uses the words a clip carries instead of the transcript, and reads a sidecar', () => {
    const own = {
      on: true,
      words: [
        [10.9, 11.2, 'la'],
        [11.3, 11.9, 'la la'],
      ],
    };
    const sound = clip('a', 2, 2, 10.8, { captions: own });
    const words = voiceWords({ clip: sound, sound, track: {} }, TRANSCRIPT);
    assert.deepEqual(
      words.map((word) => word[2]),
      ['la', 'la la'],
    );
    const sidecar = { transcript: [{ word: ' Hi', start: 11, end: 11.3 }], segments: [] };
    const plain = clip('b', 0, 2, 10.8, ON);
    const read = voiceWords({ clip: plain, sound: plain, track: {} }, sidecar);
    assert.deepEqual(
      read.map((word) => word[2]),
      ['Hi'],
    );
    assert.deepEqual(voiceWords({ clip: plain, sound: plain, track: {} }, undefined), []);
  });
});

describe('timelineCues', () => {
  const style = { group: { words: 2, chars: 18 }, hold: 0.3 };
  const edl = {
    captions: { style },
    tracks: [
      track('v1', 'video', []),
      track('a1', 'audio', [clip('a', 2, 2, 10.8, ON)]),
      track('a2', 'audio', [clip('b', 3.2, 1, 12.3, ON)]),
    ],
  };
  const rounded = (cues) =>
    cues.map((cue) => [Number(cue.start.toFixed(3)), Number(cue.end.toFixed(3)), cue.text]);

  it('writes the groups that are drawn, in timeline time, two voices in order', () => {
    const asked = [];
    const cues = timelineCues(edl, (asking) => (asked.push(asking.clipId), TRANSCRIPT));
    assert.deepEqual(rounded(cues), [
      [2.2, 3.2, 'general Kenobi.'],
      [3.2, 4, 'You are'], // its group would hold until 4.3; its clip ends at 4
      [3.4, 4.2, 'are a'], // the second voice plays 12.3..13.3 of the file from 3.2
    ]);
    const lyrics = {
      on: true,
      words: [
        [11, 11.4, 'la'],
        [11.5, 11.9, 'la.'],
      ],
    };
    const same = {
      captions: { style },
      tracks: [
        track('a1', 'audio', [clip('a', 2, 2, 10.8, ON)]),
        track('a2', 'audio', [clip('b', 2, 2, 10.8, { captions: lyrics })]),
      ],
    };
    const tied = timelineCues(same, (asking) => (asked.push(asking.clipId), TRANSCRIPT));
    assert.deepEqual(
      tied.slice(0, 2).map((cue) => cue.text),
      ['general Kenobi.', 'la la.'],
      'at the same instant the voice on the upper track comes first',
    );
    assert.deepEqual(asked, ['a', 'b', 'a'], 'a clip with words of its own is not asked about');
    assert.deepEqual(
      timelineCues(edl, () => null),
      [],
    );
    assert.deepEqual(timelineCues(edl), []);
    assert.deepEqual(
      timelineCues(null, () => TRANSCRIPT),
      [],
    );
  });

  it('can shape the groups for reading instead', () => {
    const long = { tracks: [track('a1', 'audio', [clip('a', 0, 6, 10, ON)])], captions: { style } };
    const drawn = timelineCues(long, () => TRANSCRIPT);
    const read = timelineCues(long, () => TRANSCRIPT, { group: SUBTITLE_GROUP });
    assert.equal(drawn.length, 5);
    assert.deepEqual(
      read.map((cue) => cue.text),
      ['Hello there, general Kenobi.', 'You are a bold one.'],
    );
    const pop = timelineCues(long, () => TRANSCRIPT, { style: 'pop' });
    assert.equal(pop[0].text, 'HELLO THERE', "another style than the document's");
  });
});

describe('subtitle files', () => {
  it('writes timestamps to the millisecond, rounded once', () => {
    assert.equal(formatTimestamp(0), '00:00:00,000');
    assert.equal(formatTimestamp(59.9996), '00:01:00,000');
    assert.equal(formatTimestamp(3661.5), '01:01:01,500');
    assert.equal(formatTimestamp(360000.001), '100:00:00,001');
    assert.equal(formatTimestamp(1.2345, '.'), '00:00:01.235');
    assert.equal(formatTimestamp(-4), '00:00:00,000');
    assert.equal(formatTimestamp(NaN), '00:00:00,000');
  });

  const cues = [
    { start: 3.2, end: 4, text: 'second\nline two' },
    { start: 1, end: 2.5, text: 'first & <b>bold</b> --> arrow' },
    { start: 5, end: 5, text: 'no length' },
    { start: 6, end: 7, text: '  \n ' },
    { start: 'x', end: 7, text: 'no start' },
    null,
  ];

  it('writes SubRip', () => {
    assert.equal(
      formatSrt(cues),
      '1\n00:00:01,000 --> 00:00:02,500\nfirst & <b>bold</b> --> arrow\n\n' +
        '2\n00:00:03,200 --> 00:00:04,000\nsecond\nline two\n\n' +
        '3\n00:00:05,000 --> 00:00:05,001\nno length\n',
    );
    assert.equal(formatSrt([]), '');
    assert.equal(formatSrt('cues'), '');
  });

  it('writes WebVTT', () => {
    assert.equal(
      formatVtt(cues),
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nfirst &amp; &lt;b&gt;bold&lt;/b&gt; -&gt; arrow\n\n' +
        '00:00:03.200 --> 00:00:04.000\nsecond\nline two\n\n' +
        '00:00:05.000 --> 00:00:05.001\nno length\n',
    );
    assert.equal(formatVtt(undefined), 'WEBVTT\n\n');
  });
});
