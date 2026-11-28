/**
 * One definition of "phrases for reading": the subtitle file the editor
 * writes in the browser (`src/utils/captionsUi/subtitles.js`) and the one a
 * render saves beside its video (`src/api/render/subtitles.js`) are made by
 * the same function of the captions library, and are the same bytes for
 * the same document — whatever its style does to the words on screen.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as render from '../../src/api/render/subtitles.js';
import { phraseCues, timelineCues } from '../../src/utils/captions/cues.js';
import * as editor from '../../src/utils/captionsUi/subtitles.js';
import { PRESET_NAMES, SUBTITLE_GROUP } from '../../src/utils/captions/index.js';
import { createClip, createEdl, createTrack } from '../../src/utils/edl/factory.js';
import { WORDS, timed } from './scenes.js';

const TALK = '/media/talk.mp4';
const GUEST = '/media/guest.wav';
const GUEST_WORDS = timed(
  'Honestly? That sounds about right to me, give or take. <b>Bold</b> & co.',
  3,
);
/** Sidecars as the server reads them and as the editor's word book holds them. */
const SIDECARS = {
  [TALK]: { transcript: WORDS.map(([start, end, word]) => ({ start, end, word })), segments: [] },
  [GUEST]: {
    transcript: GUEST_WORDS.map(([start, end, word]) => ({ start, end, word })),
    segments: [],
  },
};
const wordsOf = (clip) => SIDECARS[clip.sourceFile] || null;

/** Two voices, the second slipped and cut short, in a style. */
function spoken(style) {
  const talk = createClip({
    ...{ clipId: 'a', sourceFile: TALK, timelineStart: 0, timelineEnd: 18 },
    captions: { on: true },
  });
  const guest = createClip({
    ...{ clipId: 'g', sourceFile: GUEST, timelineStart: 20, timelineEnd: 26, sourceIn: 2 },
    captions: { on: true },
  });
  const own = createClip({
    ...{ clipId: 'o', sourceFile: GUEST, timelineStart: 27, timelineEnd: 31 },
    captions: {
      on: true,
      words: [
        [0.5, 1.2, 'WRITTEN'],
        [1.3, 2.4, 'on the clip.'],
      ],
    },
  });
  const tracks = [
    createTrack('video', { trackId: 'v1' }),
    createTrack('audio', { trackId: 'a1', clips: [talk, guest, own] }),
  ];
  return createEdl({ tracks, ...(style !== undefined && { captions: { style } }) });
}

const STYLES = [
  undefined,
  ...PRESET_NAMES,
  ...PRESET_NAMES.map((preset) => ({ preset })),
  { preset: 'pop', case: 'lower', punctuation: 'strip', group: { words: 1, chars: 6 } },
  { preset: 'karaoke', avoid: false, hold: 2 },
];

describe('the subtitle file of a document', () => {
  for (const format of ['srt', 'vtt']) {
    it(`is the same bytes from the editor and from a render (.${format})`, () => {
      for (const style of STYLES) {
        const edl = spoken(style);
        const fromEditor = editor.subtitleText(editor.subtitleCues(edl, wordsOf), format);
        const fromRender = render.subtitleText(render.subtitleCues(edl, SIDECARS), format);
        assert.ok(fromEditor.length > 200, 'there is a file to compare');
        assert.ok(
          Buffer.from(fromEditor).equals(Buffer.from(fromRender)),
          `${JSON.stringify(style)}: the two files differ`,
        );
      }
    });
  }

  it('is the library’s phrases for reading, from both', () => {
    const edl = spoken({ preset: 'pop' });
    const phrases = phraseCues(edl, wordsOf);
    assert.deepEqual(editor.subtitleCues(edl, wordsOf), phrases);
    assert.deepEqual(render.subtitleCues(edl, SIDECARS), phrases);
    // Phrases: the reading groups, with the words as they were written.
    const reading = { preset: 'pop', case: 'as-is', punctuation: 'keep' };
    assert.deepEqual(
      phrases,
      timelineCues(edl, wordsOf, { style: reading, group: SUBTITLE_GROUP }),
    );
    assert.deepEqual(
      phrases.slice(0, 2).map((cue) => cue.text),
      ["So, here's the thing:", 'in 2024 we shipped 37\nfeatures, and honestly?'],
    );
    assert.ok(phrases.every((cue) => cue.text.split('\n').length <= 2));
    // On screen the same document shouts two words at a time.
    assert.equal(timelineCues(edl, wordsOf)[0].text, "SO HERE'S");
    assert.deepEqual(
      render.subtitleCues(edl, SIDECARS, { as: 'drawn' }),
      timelineCues(edl, wordsOf),
    );
  });

  it('names its formats once', () => {
    assert.deepEqual([...editor.SUBTITLE_FORMATS], ['srt', 'vtt']);
    assert.equal(editor.SUBTITLE_FORMATS, render.SUBTITLE_FORMATS);
  });
});
