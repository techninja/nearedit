import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { captionInfo, setCaptionWords, setCaptions, toggleTrackMute } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { captionLine, playedWords, wordCount } from './clipState.js';
import { MEMO, talkDoc, wordsOf } from './testkit.js';

const CAN = { provider: 'faster-whisper', available: true, detail: '' };
const CANNOT = { provider: 'none', available: false, detail: 'disabled (TRANSCRIBE_PROVIDER=none)' };

/** The line for a clip of a document. */
function lineOf(doc, clipId, facts = {}) {
  const info = captionInfo(doc, clipId);
  const carrier = clipOf(doc, info.carrierId);
  const words = (facts.wordsOf || wordsOf())(info.file);
  return captionLine({ info, carrier, words, job: null, provider: CAN, ...facts });
}

describe('the line about a clip’s captions', () => {
  it('counts the words the clip plays, not the file’s', () => {
    const doc = talkDoc();
    assert.equal(playedWords(wordsOf()('/media/talk.mp4').words, clipOf(doc, 'a')), 8);
    assert.equal(playedWords(wordsOf()('/media/talk.mp4').words, { sourceIn: 2, sourceOut: 3 }), 2);
    assert.deepEqual([wordCount(1), wordCount(142)], ['1 word', '142 words']);
    const line = lineOf(doc, 'v');
    assert.deepEqual([line.kind, line.text, line.tone, line.action], ['words', '8 words', 'ok', '']);
  });

  it('says when captions are on but not shown, and when the part is silent', () => {
    const on = setCaptions(talkDoc(), ['v']);
    assert.equal(lineOf(on, 'a').text, '8 words');
    const muted = toggleTrackMute(on, 'a1');
    assert.equal(lineOf(muted, 'a').text, '8 words — not shown while its track is silent');
    const trimmed = talkDoc();
    const quiet = { ...clipOf(trimmed, 'a'), sourceIn: 0, sourceOut: 0.5 };
    const info = captionInfo(trimmed, 'a');
    const line = captionLine({ info, carrier: quiet, words: wordsOf()(info.file), job: null, provider: CAN });
    assert.deepEqual([line.kind, line.text], ['empty', 'Nothing is said in this part of the file']);
  });

  it('offers to transcribe a file that has no transcript', () => {
    const line = lineOf(talkDoc(), 'memo');
    assert.deepEqual(
      [line.kind, line.text, line.action, line.actionLabel, line.tone],
      ['missing', 'No transcript yet', 'transcribe', 'Transcribe', 'muted'],
    );
    assert.equal(lineOf(setCaptions(talkDoc(), ['memo']), 'memo').tone, 'warn');
  });

  it('shows a running transcription with its progress, and a failed one with its reason', () => {
    const running = { active: true, progress: 40, label: 'Transcribing', detail: 'chunk 2 of 5', error: '' };
    const line = lineOf(talkDoc(), 'memo', { job: running });
    assert.deepEqual(
      [line.kind, line.text, line.action, line.progress, line.tone],
      ['transcribing', 'Transcribing… 40 %', 'cancel', 40, 'busy'],
    );
    const failed = { active: false, progress: 0, label: '', detail: '', error: 'whisper crashed' };
    const after = lineOf(talkDoc(), 'memo', { job: failed });
    assert.deepEqual(
      [after.kind, after.text, after.detail, after.actionLabel],
      ['failed', 'Transcription failed', 'whisper crashed', 'Try again'],
    );
  });

  it('explains a server that cannot transcribe instead of offering a button', () => {
    const line = lineOf(talkDoc(), 'memo', { provider: CANNOT });
    assert.deepEqual([line.kind, line.text, line.action], ['unavailable', 'This server cannot transcribe', '']);
    assert.match(line.detail, /TRANSCRIBE_PROVIDER=none.*INTELLIGENCE\.md/);
    // With a transcript, what the server can do does not matter.
    assert.equal(lineOf(talkDoc(), 'a', { provider: CANNOT }).text, '8 words');
  });

  it('tells silence, soundless files and loading apart', () => {
    const silent = () => ({ state: 'none', words: [], sidecar: { transcript: [], segments: [] } });
    const found = lineOf(talkDoc(), 'memo', { wordsOf: silent });
    assert.deepEqual(
      [found.kind, found.text, found.actionLabel],
      ['silent', 'No speech was found in this file', 'Transcribe again'],
    );
    const mute = lineOf(talkDoc(), 'memo', { item: { type: 'video', hasAudio: false } });
    assert.deepEqual([mute.kind, mute.action], ['soundless', '']);
    const loading = lineOf(talkDoc(), 'memo', { wordsOf: wordsOf({ [MEMO]: 'loading' }) });
    assert.equal(loading.text, 'Reading the transcript…');
    const unread = lineOf(talkDoc(), 'memo', { wordsOf: wordsOf({ [MEMO]: 'failed' }) });
    assert.match(unread.text, /could not be read/);
  });

  it('counts words written on the clip itself', () => {
    const doc = setCaptionWords(talkDoc(), 'memo', [
      [0.5, 1, 'hello'],
      [1.2, 1.6, 'there'],
      [9, 9.5, 'cut'],
    ]);
    const line = lineOf(doc, 'memo', { provider: CANNOT });
    assert.deepEqual([line.kind, line.text], ['own', '2 words written on this clip']);
  });
});
