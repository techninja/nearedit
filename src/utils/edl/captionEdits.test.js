import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { voiceWords } from '#utils/captions/voices.js';
import { createClip } from './factory.js';
import {
  captionVoices,
  copyClips,
  duplicateClips,
  fromSavedDocument,
  moveClips,
  normalizeEdl,
  pasteAttributes,
  pasteClips,
  rippleDeleteRange,
  rippleInsert,
  setCaptionStyle,
  setCaptionWords,
  setCaptions,
  slipClip,
  splitClips,
  toSavedDocument,
  trimClipEnd,
  trimClipStart,
  unlinkClips,
  validateEdl,
} from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

/** Ten words of the file, one every half second from 1 s, each 0.4 s long. */
const TRANSCRIPT = Array.from({ length: 10 }, (_, i) => ({
  word: `w${i}`,
  start: 1 + i * 0.5,
  end: 1.4 + i * 0.5,
}));
const OWN = [
  [1, 1.4, 'la'],
  [3, 3.4, 'di'],
  [5, 5.4, 'da'],
];

/** A captioned talk — picture and linked sound, playing its file from 0 — at 2 s. */
const talking = () =>
  deepFreeze(
    setCaptions(
      testEdl({
        v1: [testClip('talk', 2, 10, { linkedClipId: 'talk_s' })],
        a1: [testClip('talk_s', 2, 10, { sourceFile: '/media/talk.mp4', linkedClipId: 'talk' })],
      }),
      'talk',
    ),
  );

/** Every word the timeline shows, as `text@start`, in voice order. */
const said = (edl) =>
  captionVoices(edl).flatMap((voice) =>
    voiceWords(voice, TRANSCRIPT).map(([start, , text]) => `${text}@${Math.round(start * 100) / 100}`),
  );

describe('captions follow the clip', () => {
  it('shows each word where the clip plays it', () => {
    assert.deepEqual(said(talking()).slice(0, 3), ['w0@3', 'w1@3.5', 'w2@4']);
    assert.equal(said(talking()).length, 10);
  });

  it('through a split: both halves keep the block, each says its own words', () => {
    const start = talking();
    const cut = assertValid(splitClips(start, 5.1));
    const [left, right] = cut.tracks[1].clips;
    assert.equal(left.captions, clipOf(start, 'talk_s').captions, 'shared, not copied');
    assert.equal(right.captions, left.captions);
    assert.equal(captionVoices(cut).length, 2);
    assert.deepEqual(said(cut), said(start), 'no word lost, none said twice, none moved');
    assert.equal(cut.tracks[0].clips.every((clip) => !('captions' in clip)), true);
  });

  it('through a split of words written on the clip', () => {
    const own = deepFreeze(setCaptionWords(talking(), 'talk', OWN));
    const cut = assertValid(splitClips(own, 6));
    const [left, right] = cut.tracks[1].clips;
    assert.equal(right.captions.words, left.captions.words, 'one list for both pieces');
    assert.deepEqual(said(cut), ['la@3', 'di@5', 'da@7']);
  });

  it('through trims: words that were cut away are gone, the rest stay put', () => {
    const start = talking();
    const later = assertValid(trimClipStart(start, 'talk', 4.3));
    assert.deepEqual(said(later).slice(0, 2), ['w3@4.5', 'w4@5']);
    assert.equal(said(later).length, 7);
    const shorter = assertValid(trimClipEnd(start, 'talk_s', 5));
    assert.deepEqual(said(shorter), ['w0@3', 'w1@3.5', 'w2@4', 'w3@4.5']);
    assert.deepEqual(said(trimClipEnd(shorter, 'talk', 10)), said(start), 'and come back');
  });

  it('through a slip: the clip stays, the words slide with the source', () => {
    const slipped = assertValid(slipClip(talking(), 'talk', 1));
    assert.deepEqual(said(slipped).slice(0, 2), ['w0@2', 'w1@2.5']);
    assert.equal(clipOf(slipped, 'talk_s').timelineStart, 2);
  });

  it('through a move, a ripple insert and a ripple delete', () => {
    const start = talking();
    assert.deepEqual(said(moveClips(start, ['talk'], { delta: 3 })).slice(0, 2), ['w0@6', 'w1@6.5']);
    assert.deepEqual(said(rippleInsert(start, 1, 2)).slice(0, 2), ['w0@5', 'w1@5.5']);
    const closed = assertValid(rippleDeleteRange(start, 4, 6, { scope: 'all' }));
    assert.deepEqual(said(closed), ['w0@3', 'w1@3.5', 'w6@4', 'w7@4.5', 'w8@5', 'w9@5.5']);
  });

  it('through unlinking: the sound keeps the voice, the picture has none', () => {
    const free = unlinkClips(talking(), ['talk']);
    assert.deepEqual(
      captionVoices(free).map(({ clip }) => clip.clipId),
      ['talk_s'],
    );
  });
});

describe('captions through copy and paste', () => {
  it('pastes and duplicates a captioned pair with its captions and words', () => {
    const own = deepFreeze(setCaptionWords(talking(), 'talk', OWN));
    const pasted = assertValid(pasteClips(own, copyClips(own, ['talk', 'talk_s']), { time: 20 }));
    const sound = pasted.tracks[1].clips[1];
    assert.deepEqual(sound.captions, { on: true, words: OWN });
    assert.equal(captionVoices(pasted).length, 2);
    assert.deepEqual(said(pasted).slice(3), ['la@21', 'di@23', 'da@25']);
    const twice = assertValid(duplicateClips(talking(), ['talk', 'talk_s']));
    assert.deepEqual(twice.tracks[1].clips.map((clip) => clip.captions), [{ on: true }, { on: true }]);
  });

  it('keeps a target’s captions when attributes are pasted onto it', () => {
    const start = talking();
    const look = createClip({ clipId: 'look', timelineStart: 0, timelineEnd: 2, blendMode: 'screen' });
    const pasted = assertValid(pasteAttributes(start, look, ['talk', 'talk_s']));
    assert.equal(clipOf(pasted, 'talk').blendMode, 'screen');
    assert.deepEqual(clipOf(pasted, 'talk_s').captions, { on: true });
  });

  it('pastes the captions switch only when asked for by name', () => {
    const start = deepFreeze(
      testEdl({
        a1: [testClip('one', 0, 4, { captions: { on: true, words: OWN } }), testClip('two', 5, 9)],
      }),
    );
    assert.equal(clipOf(pasteAttributes(start, 'one', ['two']), 'two').captions, undefined);
    const on = assertValid(pasteAttributes(start, 'one', ['two'], { captions: true }));
    assert.deepEqual(clipOf(on, 'two').captions, { on: true }, 'the switch, not the words');
    const off = pasteAttributes(on, 'two', ['one'], { captions: true });
    assert.deepEqual(clipOf(off, 'one').captions, { on: true, words: OWN }, 'two is on: one stays on');
    const none = pasteAttributes(start, clipOf(start, 'two'), ['one'], { captions: true });
    assert.deepEqual(clipOf(none, 'one').captions, { on: false, words: OWN });
  });
});

describe('captions in a stored document', () => {
  const styled = () => setCaptionStyle(setCaptionWords(talking(), 'talk', OWN), { preset: 'pop', size: 8 });

  it('round-trips through the saved shape unchanged', () => {
    const edl = splitClips(styled(), 6);
    const saved = JSON.parse(JSON.stringify(toSavedDocument(edl, { zoom: 2 })));
    assert.deepEqual(saved.captions, { style: { preset: 'pop', size: 8 } });
    const { edl: loaded } = fromSavedDocument(saved);
    assert.deepEqual(loaded, edl);
    assertValid(loaded);
    const [left, right] = loaded.tracks[1].clips;
    assert.equal(left.captions, right.captions, 'pieces share their words again after loading');
    assert.equal(normalizeEdl(loaded).tracks[1].clips[0].captions, left.captions, 'kept as it is');
  });

  it('leaves a document without captions exactly as it was', () => {
    const plain = testEdl({ v1: [testClip('a', 0, 4)], a1: [testClip('b', 0, 4)] });
    const loaded = normalizeEdl(JSON.parse(JSON.stringify(plain)));
    assert.deepEqual(loaded, plain);
    assert.equal('captions' in loaded, false);
    assert.equal('captions' in toSavedDocument(loaded), false);
    assert.equal(loaded.tracks.some((track) => track.clips.some((clip) => 'captions' in clip)), false);
  });

  it('repairs what a hand-written document says', () => {
    const raw = {
      captions: { style: { preset: 'nope', size: 500, group: { words: 2 } }, extra: 1 },
      tracks: [
        {
          type: 'video',
          clips: [
            { timelineStart: 0, timelineEnd: 2, text: { content: 'Hi' }, captions: { on: true } },
          ],
        },
        {
          type: 'audio',
          clips: [
            {
              ...{ sourceFile: 'a.wav', timelineStart: 0, timelineEnd: 4 },
              captions: { on: 'yes', words: [[2, 2.5, 'b'], { start: 1, end: 1.5, word: 'a' }, [0, 1]] },
            },
            { sourceFile: 'b.wav', timelineStart: 5, timelineEnd: 9, captions: { on: true } },
            { sourceFile: 'c.wav', timelineStart: 10, timelineEnd: 12, captions: { on: false } },
            { sourceFile: 'd.wav', timelineStart: 13, timelineEnd: 15, captions: 'on' },
          ],
        },
      ],
    };
    const edl = assertValid(normalizeEdl(raw));
    assert.deepEqual(edl.captions, { style: { preset: 'clean', size: 20, group: { words: 2 } } });
    assert.equal('captions' in edl.tracks[0].clips[0], false, 'a title has no captions');
    assert.deepEqual(
      edl.tracks[1].clips.map((clip) => clip.captions),
      [{ on: false, words: [[1, 1.5, 'a'], [2, 2.5, 'b']] }, { on: true }, undefined, undefined],
    );
    assert.equal(normalizeEdl({ tracks: [], captions: {} }).captions, undefined);
    assert.equal(normalizeEdl({ tracks: [], captions: { style: 7 } }).captions, undefined);
    assert.deepEqual(normalizeEdl({ tracks: [], captions: { style: 'boxed' } }).captions, {
      style: { preset: 'boxed' },
    });
  });

  it('is refused by validateEdl when it is not what the normaliser writes', () => {
    const good = styled();
    const withClip = (captions, lane = 1) => ({
      ...good,
      tracks: good.tracks.map((track, t) =>
        t === lane ? { ...track, clips: [{ ...track.clips[0], captions }] } : track,
      ),
    });
    const paths = (edl) => validateEdl(edl).problems.map((problem) => problem.path);
    assert.deepEqual(paths(good), []);
    assert.deepEqual(paths(withClip({ on: 'yes' })), ['tracks[1].clips[0].captions']);
    assert.deepEqual(paths(withClip({ on: false })), ['tracks[1].clips[0].captions']);
    assert.deepEqual(paths(withClip({ on: true, words: [] })), ['tracks[1].clips[0].captions']);
    const unsorted = [[2, 3, 'b'], [1, 1.5, 'a']];
    assert.deepEqual(paths(withClip({ on: true, words: unsorted })), ['tracks[1].clips[0].captions']);
    const title = createClip({ clipId: 't', timelineStart: 0, timelineEnd: 2, text: { content: 'x' } });
    const onTitle = { ...good, tracks: [{ ...good.tracks[0], clips: [{ ...title, captions: { on: true } }] }, good.tracks[1]] };
    assert.deepEqual(paths(onTitle), ['tracks[0].clips[0].captions']);
    assert.deepEqual(paths({ ...good, captions: { style: { preset: 'pop', size: 999 } } }), ['captions']);
    assert.deepEqual(paths({ ...good, captions: {} }), ['captions']);
  });
});
