import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setCaptionWords, setCaptions } from '#utils/edl/index.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';
import { allSpeechReport } from './actions.js';
import { captionSummary, summaryLine } from './summary.js';
import { MEMO, SONG, TALK, talkDoc, wordsOf } from './testkit.js';

describe('captions of the whole timeline', () => {
  it('counts voices, not clips: a linked picture and sound are one', () => {
    const summary = captionSummary(talkDoc(), wordsOf());
    assert.deepEqual(
      summary.voices.map((voice) => [voice.clipId, voice.on, voice.words, voice.count]),
      [
        ['a', false, 'ready', 8],
        ['memo', false, 'none', 0],
        ['bed', false, 'none', 0],
      ],
    );
    assert.deepEqual([summary.on, summary.shown, summary.ready], [0, 0, 1]);
    assert.equal(summaryLine(summary), 'Off — 3 clips with sound');
  });

  it('says what is on and how many words that shows', () => {
    const on = setCaptions(talkDoc(), ['v']);
    const summary = captionSummary(on, wordsOf());
    assert.deepEqual([summary.on, summary.shown, summary.ready], [1, 8, 0]);
    assert.equal(summaryLine(summary), 'On for 1 of 3 clips · 8 words');
    const one = captionSummary(setCaptionWords(on, 'memo', [[0.5, 1, 'hi']]), wordsOf());
    assert.equal(one.voices[1].words, 'ready');
    const both = captionSummary(
      setCaptions(setCaptionWords(on, 'memo', [[0.5, 1, 'hi']]), ['memo']),
      wordsOf(),
    );
    assert.equal(summaryLine(both), 'On for 2 of 3 clips · 9 words');
  });

  it('lists the files without a transcript, and whether captions wait on them', () => {
    const summary = captionSummary(setCaptions(talkDoc(), ['memo']), wordsOf());
    assert.deepEqual(summary.missing, [
      { file: MEMO, name: 'memo.wav', clipIds: ['memo'], on: true },
      { file: SONG, name: 'song.mp3', clipIds: ['bed'], on: false },
    ]);
    // A file still being read is not called missing.
    const reading = captionSummary(talkDoc(), wordsOf({ [MEMO]: 'loading', [SONG]: 'loading' }));
    assert.deepEqual(reading.missing, []);
  });

  it('gathers the clips of one file, and leaves music clips and titles out', () => {
    const doc = testEdl({
      v1: [testClip('title', 0, 2, { sourceFile: '', text: { content: 'Hello' } })],
      a1: [
        testClip('m1', 0, 2, { sourceFile: MEMO }),
        testClip('m2', 2, 4, { sourceFile: MEMO }),
        testClip('song', 4, 8, { sourceFile: '', music: { song: {} } }),
      ],
    });
    const summary = captionSummary(doc, wordsOf());
    assert.deepEqual(summary.missing, [
      { file: MEMO, name: 'memo.wav', clipIds: ['m1', 'm2'], on: false },
    ]);
    assert.equal(summary.voices.length, 2);
    assert.equal(summaryLine(captionSummary(testEdl({}), wordsOf())), 'No clip with sound on the timeline yet');
  });

  it('reports what “Caption all speech” did', () => {
    const after = captionSummary(setCaptions(talkDoc(), ['a']), wordsOf());
    assert.deepEqual(allSpeechReport(1, after), {
      title: 'Captions on for 1 clip',
      detail: 'No transcript yet for memo.wav, song.mp3 — transcribe in Inspector ▸ Captions.',
    });
    assert.equal(allSpeechReport(0, after).title, 'Every clip with a transcript already has captions');
    const none = captionSummary(talkDoc(), wordsOf({ [TALK]: 'none' }));
    assert.equal(allSpeechReport(0, none).title, 'Nothing to caption yet');
    assert.match(allSpeechReport(0, none).detail, /talk\.mp4, memo\.wav, song\.mp3/);
    assert.deepEqual(allSpeechReport(0, captionSummary(testEdl({}), wordsOf())), {
      title: 'No speech on the timeline to caption',
      detail: '',
    });
  });
});
