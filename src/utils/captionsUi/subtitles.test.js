import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { patchCaptionStyle, setCaptions } from '#utils/edl/index.js';
import { captionedCount, withSubtitles } from './exportSubtitles.js';
import { subtitleCues, subtitleText } from './subtitles.js';
import { TALK_SIDECAR, talkDoc } from './testkit.js';

const words = () => TALK_SIDECAR;

describe('subtitle files from the editor', () => {
  it('writes the captions as phrases to read, timed on the timeline', () => {
    const doc = setCaptions(talkDoc(), ['v']);
    const cues = subtitleCues(doc, words);
    assert.deepEqual(cues, [
      { start: 1, end: 5.2, text: 'We arrived at the park\nearly this morning.' },
    ]);
    assert.equal(
      subtitleText(cues, 'srt'),
      '1\n00:00:01,000 --> 00:00:05,200\nWe arrived at the park\nearly this morning.\n',
    );
    assert.match(subtitleText(cues, 'vtt'), /^WEBVTT\n\n00:00:01\.000 --> 00:00:05\.200\n/);
  });

  it('keeps capitals and punctuation whatever the style does on screen', () => {
    const pop = patchCaptionStyle(setCaptions(talkDoc(), ['v']), 'preset', 'pop');
    assert.equal(subtitleCues(pop, words)[0].text, 'We arrived at the park\nearly this morning.');
  });

  it('has nothing to write without captions, or without words', () => {
    assert.deepEqual(subtitleCues(talkDoc(), words), []);
    assert.deepEqual(
      subtitleCues(setCaptions(talkDoc(), ['v']), () => null),
      [],
    );
    assert.equal(subtitleText([], 'srt'), '');
  });
});

describe('the export’s subtitle option', () => {
  it('is sent with the render request only when there are captions to save', () => {
    const request = { projectId: 'p', preset: 'standard' };
    assert.deepEqual(withSubtitles(request, 'srt', 2), { ...request, subtitles: 'srt' });
    assert.deepEqual(withSubtitles(request, 'vtt', 1), { ...request, subtitles: 'vtt' });
    assert.equal(withSubtitles(request, '', 2), request);
    assert.equal(withSubtitles(request, 'srt', 0), request);
    assert.equal(withSubtitles(request, 'docx', 2), request);
  });

  it('counts voices with captions switched on', () => {
    assert.equal(captionedCount(talkDoc()), 0);
    assert.equal(captionedCount(setCaptions(talkDoc(), ['v', 'a', 'memo'])), 2);
  });
});
