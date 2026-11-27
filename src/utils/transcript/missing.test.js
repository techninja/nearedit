import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { explainMissing } from './missing.js';

const file = { file: '/media/talk.mp4' };
const video = { type: 'video', hasAudio: true };
const ready = { transcription: { provider: 'whisper-cpp', available: true, detail: '' } };

describe('explainMissing', () => {
  it('asks for a clip when nothing with speech is selected', () => {
    const none = explainMissing({ file: '' }, null, null, null);
    assert.deepEqual([none.title, none.canTranscribe], ['No transcript to show', false]);
    assert.match(none.detail, /Select a clip with speech/);
    assert.match(
      explainMissing({ file: '', note: 'title' }, null, null, null).detail,
      /Titles are text/,
    );
    assert.match(
      explainMissing({ file: '', note: 'image' }, null, null, null).detail,
      /still image/,
    );
    assert.match(
      explainMissing({ file: '', note: 'placeholder' }, null, null, null).detail,
      /no media yet/,
    );
  });

  it('says so when a file has no sound', () => {
    for (const item of [{ type: 'image' }, { type: 'video', hasAudio: false }, { type: 'text' }]) {
      const reason = explainMissing(file, item, {}, ready);
      assert.deepEqual([reason.title, reason.canTranscribe], ['Nothing to transcribe', false]);
    }
    assert.equal(explainMissing(file, null, { hasAudio: false }, ready).canTranscribe, false);
  });

  it('names the missing provider instead of offering a button that would fail', () => {
    const status = {
      transcription: { provider: 'auto', available: false, detail: 'whisper-cli not found' },
    };
    const reason = explainMissing(file, video, {}, status);
    assert.equal(reason.title, 'Transcription is not available');
    assert.match(reason.detail, /whisper-cli not found/);
    assert.match(reason.detail, /INTELLIGENCE\.md/);
    assert.equal(reason.canTranscribe, false);
    const named = { transcription: { provider: 'openai', available: false, detail: '' } };
    assert.match(explainMissing(file, video, {}, named).detail, /\(openai\).*none is configured/);
  });

  it('offers to transcribe when a provider is there, or the status is not known yet', () => {
    assert.deepEqual(
      [
        explainMissing(file, video, {}, ready).title,
        explainMissing(file, video, {}, ready).canTranscribe,
      ],
      ['Not transcribed yet', true],
    );
    assert.equal(explainMissing(file, video, null, null).canTranscribe, true);
  });

  it('tells an empty result from a missing one', () => {
    const empty = explainMissing(file, video, { transcript: [], segments: [] }, ready);
    assert.deepEqual([empty.title, empty.canTranscribe], ['No speech found', true]);
  });
});
