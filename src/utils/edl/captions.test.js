import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from './factory.js';
import {
  canCaption,
  captionAllSpeech,
  captionInfo,
  captionedClips,
  captionsWithoutWords,
  patchCaptionStyle,
  setCaptionStyle,
  setCaptionWords,
  setCaptions,
  toggleTrackLock,
  toggleTrackMute,
  toggleTrackSolo,
  updateClip,
  voiceFiles,
} from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

const WORDS = [
  [1, 1.3, 'one'],
  [1.4, 1.7, 'two'],
  [1.8, 2.2, 'three'],
];

/** A talk (picture + linked sound), a voice-over, a music bed and a title. */
const timeline = () =>
  deepFreeze(
    testEdl({
      v1: [
        createClip({ clipId: 'title', timelineStart: 0, timelineEnd: 3, text: { content: 'Hi' } }),
      ],
      v2: [testClip('talk', 0, 10, { linkedClipId: 'talk_s' })],
      a1: [testClip('talk_s', 0, 10, { sourceFile: '/media/talk.mp4', linkedClipId: 'talk' })],
      a2: [testClip('vo', 12, 20, { sourceFile: '/media/vo.wav' })],
      a3: [testClip('bed', 0, 20, { sourceFile: '/media/bed.mp3' })],
    }),
  );

const blocks = (edl) =>
  Object.fromEntries(
    edl.tracks.flatMap((track) =>
      track.clips.filter((clip) => 'captions' in clip).map((clip) => [clip.clipId, clip.captions]),
    ),
  );

describe('setCaptions', () => {
  it('switches clips on and off in one step, leaving no field behind when off', () => {
    const start = timeline();
    const on = assertValid(setCaptions(start, ['vo', 'bed']));
    assert.deepEqual(blocks(on), { vo: { on: true }, bed: { on: true } });
    assert.equal(setCaptions(on, ['vo', 'bed']), on, 'already on: the same document');
    const off = assertValid(setCaptions(on, ['vo', 'bed'], false));
    assert.deepEqual(blocks(off), {});
    assert.deepEqual(off, start);
    assert.equal(setCaptions(start, 'vo', false), start);
    assert.equal(on.tracks[0], start.tracks[0], 'untouched tracks are shared');
  });

  it('treats a linked picture and sound as one voice carried by the sound clip', () => {
    const start = timeline();
    for (const ids of [['talk'], ['talk_s'], ['talk', 'talk_s']]) {
      const on = assertValid(setCaptions(start, ids));
      assert.deepEqual(blocks(on), { talk_s: { on: true } }, ids.join('+'));
    }
    const on = setCaptions(start, 'talk');
    assert.deepEqual(blocks(setCaptions(on, 'talk', false)), {});
    assert.deepEqual(blocks(setCaptions(on, 'talk_s', false)), {});
  });

  it('moves a block written on the picture to the sound clip, words included', () => {
    const start = timeline();
    const written = updateIn(start, 'talk', { captions: { on: true, words: WORDS } });
    assert.equal(captionInfo(written, 'talk_s').on, true, 'read as one voice already');
    const off = assertValid(setCaptions(written, 'talk_s', false));
    assert.deepEqual(blocks(off), { talk_s: { on: false, words: WORDS } });
    assert.equal(off.tracks[2].clips[0].captions.words, WORDS, 'the list is shared, not copied');
    assert.deepEqual(blocks(setCaptions(off, 'talk')), { talk_s: { on: true, words: WORDS } });
  });

  it('leaves alone what cannot have captions, unknown ids and locked tracks', () => {
    const start = timeline();
    assert.equal(setCaptions(start, ['title', 'nope']), start);
    assert.equal(canCaption(clipOf(start, 'title'), start.tracks[0]), false);
    assert.equal(canCaption(clipOf(start, 'vo'), start.tracks[3]), true);
    const locked = toggleTrackLock(start, 'a2');
    assert.equal(setCaptions(locked, 'vo'), locked);
    // Naming the picture of a pair whose sound is locked changes nothing either.
    const lockedSound = toggleTrackLock(start, 'a1');
    assert.equal(setCaptions(lockedSound, 'talk'), lockedSound);
  });

  it('cannot be written through updateClip', () => {
    const on = setCaptions(timeline(), 'vo');
    assert.equal(updateClip(on, 'vo', { captions: { on: false } }), on);
    assert.equal(
      updateClip(timeline(), 'vo', { captions: { on: true } }).tracks[3].clips[0].captions,
      undefined,
    );
  });
});

/** Write a field straight onto a clip, as a hand-written document would have it. */
function updateIn(edl, clipId, fields) {
  const tracks = edl.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => (clip.clipId === clipId ? { ...clip, ...fields } : clip)),
  }));
  return deepFreeze({ ...edl, tracks });
}

describe('captionAllSpeech', () => {
  it('switches on the sound clips that have words', () => {
    const start = timeline();
    const asked = [];
    const hasWords = (clip) => (asked.push(clip.clipId), clip.sourceFile !== '/media/bed.mp3');
    const on = assertValid(captionAllSpeech(start, hasWords));
    assert.deepEqual(blocks(on), { talk_s: { on: true }, vo: { on: true } });
    assert.deepEqual(asked, ['talk_s', 'vo', 'bed']);
    assert.equal(captionAllSpeech(on, hasWords), on, 'nothing left to switch on');
  });

  it('without a predicate takes every sound clip; a clip with its own words always counts', () => {
    const start = timeline();
    assert.deepEqual(Object.keys(blocks(captionAllSpeech(start))), ['talk_s', 'vo', 'bed']);
    const lyrics = setCaptionWords(start, 'bed', WORDS);
    const asked = [];
    const on = captionAllSpeech(lyrics, (clip) => (asked.push(clip.clipId), false));
    assert.deepEqual(asked, ['talk_s', 'vo'], 'not asked for the clip that carries words');
    assert.deepEqual(blocks(on), { bed: { on: true, words: WORDS } });
  });
});

describe('setCaptionWords', () => {
  it('stores words in time order, to the millisecond, and removes them again', () => {
    const start = timeline();
    const loose = [
      { start: 2.00004, end: 2.5, word: ' later ' },
      [1, 1.25, 'first'],
      [NaN, 1, 'no start'],
    ];
    const own = assertValid(setCaptionWords(start, 'vo', loose));
    assert.deepEqual(blocks(own), {
      vo: {
        on: false,
        words: [
          [1, 1.25, 'first'],
          [2, 2.5, 'later'],
        ],
      },
    });
    assert.equal(setCaptionWords(own, 'vo', loose), own, 'the same words again');
    assert.deepEqual(blocks(setCaptions(own, 'vo')).vo.on, true);
    assert.deepEqual(blocks(setCaptionWords(own, 'vo', null)), {});
    assert.deepEqual(blocks(setCaptionWords(setCaptions(own, 'vo'), 'vo', [])), {
      vo: { on: true },
    });
  });

  it('writes a pair’s words on its sound clip', () => {
    const own = setCaptionWords(setCaptions(timeline(), 'talk'), 'talk', WORDS);
    assert.deepEqual(blocks(own), { talk_s: { on: true, words: WORDS } });
    assert.equal(captionInfo(own, 'talk').ownWords, 3);
  });
});

describe('the timeline’s caption style', () => {
  it('is stored as a preset and what differs, and removed with null', () => {
    const start = timeline();
    assert.equal(start.captions, undefined);
    const pop = assertValid(setCaptionStyle(start, 'pop'));
    assert.deepEqual(pop.captions, { style: { preset: 'pop' } });
    const own = assertValid(
      setCaptionStyle(start, {
        preset: 'boxed',
        size: 6,
        nonsense: 1,
        highlight: { color: '#FF0000' },
      }),
    );
    assert.deepEqual(own.captions, {
      style: { preset: 'boxed', size: 6, highlight: { color: '#ff0000' } },
    });
    assert.equal(setCaptionStyle(own, { ...own.captions.style }), own);
    assert.equal(setCaptionStyle(own, null).captions, undefined);
    assert.equal('captions' in setCaptionStyle(own, null), false);
    assert.equal(setCaptionStyle(start, null), start);
    assert.equal(pop.tracks, start.tracks);
  });

  it('changes one field at a time', () => {
    const start = timeline();
    const sized = assertValid(patchCaptionStyle(start, 'size', '7'));
    assert.deepEqual(sized.captions, { style: { preset: 'clean', size: 7 } });
    const marked = patchCaptionStyle(sized, 'highlight.mode', 'box');
    assert.deepEqual(marked.captions.style, {
      preset: 'clean',
      size: 7,
      highlight: { mode: 'box' },
    });
    assert.equal(patchCaptionStyle(marked, 'size', 400).captions.style.size, 20, 'clamped');
    assert.equal(patchCaptionStyle(marked, 'group.words', 4.4).captions.style.group.words, 4);
    assert.deepEqual(patchCaptionStyle(marked, 'highlight.mode', null).captions.style, {
      preset: 'clean',
      size: 7,
    });
  });

  it('ignores what it cannot use', () => {
    const start = timeline();
    const sized = patchCaptionStyle(start, 'size', 7);
    assert.equal(patchCaptionStyle(sized, 'size', 'big'), sized);
    assert.equal(patchCaptionStyle(sized, 'highlight.mode', 'sparkle'), sized);
    assert.equal(patchCaptionStyle(sized, 'color', 'red'), sized);
    assert.equal(patchCaptionStyle(sized, 'no.such.field', 1), sized);
    assert.equal(patchCaptionStyle(sized, 'preset', 'vaporwave'), sized);
    assert.equal(patchCaptionStyle(start, 'size', 5.2), start, 'the default changes nothing');
    assert.equal(patchCaptionStyle(start, 'size', null), start);
  });

  it('switches preset as it comes, dropping what differed', () => {
    const sized = patchCaptionStyle(timeline(), 'size', 7);
    assert.deepEqual(patchCaptionStyle(sized, 'preset', 'karaoke').captions, {
      style: { preset: 'karaoke' },
    });
    assert.deepEqual(patchCaptionStyle(sized, 'preset', 'clean').captions, {
      style: { preset: 'clean' },
    });
  });
});

describe('reading caption state', () => {
  it('lists the captioned clips, each voice once', () => {
    const start = timeline();
    assert.deepEqual(captionedClips(start), []);
    const on = setCaptions(start, ['talk', 'talk_s', 'vo']);
    const listed = captionedClips(on);
    assert.deepEqual(
      listed.map(({ clip, track }) => `${track.trackId}:${clip.clipId}`),
      ['a1:talk_s', 'a2:vo'],
    );
  });

  it('says what an inspector needs about one clip', () => {
    const on = setCaptions(timeline(), 'talk');
    assert.deepEqual(captionInfo(on, 'talk'), {
      can: true,
      on: true,
      carrierId: 'talk_s',
      ownWords: 0,
      file: '/media/talk.mp4',
      heard: true,
    });
    assert.deepEqual(captionInfo(on, 'vo'), {
      can: true,
      on: false,
      carrierId: 'vo',
      ownWords: 0,
      file: '/media/vo.wav',
      heard: false,
    });
    assert.equal(captionInfo(on, 'title').can, false);
    assert.equal(captionInfo(on, 'missing').can, false);
    const own = setCaptionWords(on, 'talk', WORDS);
    assert.deepEqual([captionInfo(own, 'talk').ownWords, captionInfo(own, 'talk').file], [3, '']);
  });

  it('knows a muted or out-soloed voice is on but not heard', () => {
    const on = setCaptions(timeline(), ['talk', 'vo']);
    const muted = toggleTrackMute(on, 'a1');
    assert.deepEqual(
      [captionInfo(muted, 'talk').on, captionInfo(muted, 'talk').heard],
      [true, false],
    );
    assert.equal(captionInfo(muted, 'vo').heard, true);
    const solo = toggleTrackSolo(on, 'a1');
    assert.equal(captionInfo(solo, 'talk').heard, true);
    assert.equal(captionInfo(solo, 'vo').heard, false);
    assert.deepEqual(voiceFiles(solo), ['/media/talk.mp4']);
  });

  it('finds the captioned clips that have no words, and the files that are needed', () => {
    const on = setCaptionWords(setCaptions(timeline(), ['talk', 'vo', 'bed']), 'bed', WORDS);
    assert.deepEqual(voiceFiles(on), ['/media/talk.mp4', '/media/vo.wav']);
    const missing = captionsWithoutWords(on, (clip) => clip.sourceFile === '/media/talk.mp4');
    assert.deepEqual(
      missing.map(({ clip }) => clip.clipId),
      ['vo'],
    );
    assert.deepEqual(
      captionsWithoutWords(on, () => true),
      [],
    );
  });
});
