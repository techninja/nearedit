import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captionVoices, timelineCues, voiceFiles, voiceWords, voicesAt } from './index.js';

/** A clip playing `length` seconds of its file from `sourceIn`, placed at `start`. */
const clip = (clipId, start, length, sourceIn = 0, extra = {}) => ({
  clipId,
  sourceFile: '/project/talk.mp4',
  sourceIn,
  sourceOut: sourceIn + length,
  timelineStart: start,
  timelineEnd: start + length,
  linkedClipId: '',
  captions: { on: true },
  ...extra,
});
const audio = (...clips) => ({ tracks: [{ trackId: 'a1', type: 'audio', clips }] });
/** A word every half second from 1 s, each 0.4 s long. */
const TRANSCRIPT = 'We shipped thirty seven features this year, and we fixed the rest.'
  .split(' ')
  .map((word, i) => [1 + i * 0.5, 1.4 + i * 0.5, word]);
const wordsOf = () => TRANSCRIPT;
const spans = (edl) =>
  captionVoices(edl).map(({ sound, pieces }) => [
    sound.timelineStart,
    sound.timelineEnd,
    pieces.map((piece) => piece.clipId).join('+'),
  ]);

describe('pieces that play on are one voice', () => {
  const whole = audio(clip('a', 2, 8));
  // The same clip cut at 4.2 — in the middle of "thirty" — and at 6.
  const cut = audio(clip('a', 2, 2.2), clip('b', 4.2, 1.8, 2.2), clip('c', 6, 4, 4));

  it('joins the pieces of a split clip', () => {
    assert.deepEqual(spans(whole), [[2, 10, 'a']]);
    assert.deepEqual(spans(cut), [[2, 10, 'a+b+c']]);
    const [voice] = captionVoices(cut);
    assert.equal(voice.clip, cut.tracks[0].clips[0], 'the first piece carries the voice');
    assert.equal(voice.sound.sourceIn, 0);
    assert.equal(voice.sound.sourceOut, 8);
    assert.deepEqual(voiceFiles(cut), ['/project/talk.mp4']);
  });

  it('shows exactly the captions of the uncut clip', () => {
    assert.deepEqual(timelineCues(cut, wordsOf), timelineCues(whole, wordsOf));
    assert.deepEqual(
      voiceWords(captionVoices(cut)[0], TRANSCRIPT),
      voiceWords(captionVoices(whole)[0], TRANSCRIPT),
    );
    // No instant belongs to two voices, and none to no voice, at a cut.
    for (const time of [4.2 - 1e-9, 4.2, 6]) assert.equal(voicesAt(cut, time).length, 1, `${time}`);
  });

  it('remembers a run from one document to the next', () => {
    const [a, b, c] = cut.tracks[0].clips;
    const other = { tracks: [{ trackId: 'a1', type: 'audio', clips: [a, b, c] }], markers: [1] };
    assert.equal(captionVoices(other)[0].sound, captionVoices(cut)[0].sound);
    const words = voiceWords(captionVoices(cut)[0], TRANSCRIPT);
    assert.equal(voiceWords(captionVoices(other)[0], TRANSCRIPT), words, 'nothing is regrouped');
  });

  it('keeps pieces apart once one of them is moved, slipped or trimmed', () => {
    const moved = audio(clip('a', 2, 2.2), clip('b', 5, 1.8, 2.2));
    const slipped = audio(clip('a', 2, 2.2), clip('b', 4.2, 1.8, 3));
    const trimmed = audio(clip('a', 2, 2), clip('b', 4.2, 1.8, 2.2));
    for (const edl of [moved, slipped, trimmed]) assert.equal(captionVoices(edl).length, 2);
    // Apart, the word under the cut belongs to the piece that plays most of it.
    const [, late] = captionVoices(moved);
    const [start, end, text] = voiceWords(late, TRANSCRIPT)[0];
    assert.deepEqual([start, Math.round(end * 1000) / 1000, text], [5, 5.2, 'thirty']);
  });

  it('does not join other files, other words, or a piece that is switched off', () => {
    const lyrics = { on: true, words: [[0, 1, 'la']] };
    const cases = [
      audio(clip('a', 2, 2), clip('b', 4, 2, 2, { sourceFile: '/project/other.mp4' })),
      audio(clip('a', 2, 2), clip('b', 4, 2, 2, { captions: lyrics })),
      // Equal words in two lists are two voices: pieces share one list (a split, a load).
      audio(
        clip('a', 2, 2, 0, { captions: lyrics }),
        clip('b', 4, 2, 2, { captions: { on: true, words: [[0, 1, 'la']] } }),
      ),
    ];
    for (const edl of cases) assert.equal(captionVoices(edl).length, 2);
    const off = audio(clip('a', 2, 2), clip('b', 4, 2, 2, { captions: { on: false } }));
    assert.deepEqual(spans(off), [[2, 4, 'a']]);
    const shared = audio(clip('a', 2, 2, 0, { captions: lyrics }), clip('b', 4, 2, 2, { captions: lyrics }));
    assert.deepEqual(spans(shared), [[2, 6, 'a+b']], 'pieces that share their own words are one');
  });

  it('joins the sound of split pairs, whichever clip was switched on', () => {
    const picture = (id, start, length, sourceIn, partner) =>
      clip(id, start, length, sourceIn, { linkedClipId: partner });
    const sound = (id, start, length, sourceIn, partner) =>
      clip(id, start, length, sourceIn, { linkedClipId: partner, captions: undefined });
    const edl = {
      tracks: [
        { trackId: 'v1', type: 'video', clips: [picture('p1', 0, 3, 0, 's1'), picture('p2', 3, 3, 3, 's2')] },
        { trackId: 'a1', type: 'audio', clips: [sound('s1', 0, 3, 0, 'p1'), sound('s2', 3, 3, 3, 'p2')] },
      ],
    };
    assert.deepEqual(spans(edl), [[0, 6, 's1+s2']]);
    assert.equal(captionVoices(edl)[0].clip.clipId, 'p1');
  });
});
