import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { providerRows, setupSummary } from './providers.js';

const STATUS = {
  ffmpeg: { available: true, detail: '6.1.1' },
  transcription: { provider: 'whisper-cpp', model: 'base', available: true, detail: '' },
  vision: { provider: 'ollama', model: 'llava:7b', available: false, detail: 'connection refused' },
  llm: {
    provider: 'none',
    model: 'qwen3:14b',
    available: false,
    detail: 'disabled (LLM_PROVIDER=none)',
  },
};

describe('providerRows', () => {
  const rows = Object.fromEntries(providerRows(STATUS).map((row) => [row.key, row]));

  it('lists the four capabilities in a fixed order', () => {
    assert.deepEqual(
      providerRows(STATUS).map((row) => row.key),
      ['ffmpeg', 'transcription', 'vision', 'llm'],
    );
  });

  it('shows the FFmpeg version as the value', () => {
    assert.equal(rows.ffmpeg.available, true);
    assert.equal(rows.ffmpeg.value, '6.1.1');
    assert.equal(rows.ffmpeg.detail, '');
    assert.equal(rows.ffmpeg.required, true);
  });

  it('shows provider and model for a configured provider', () => {
    assert.equal(rows.transcription.value, 'whisper-cpp · base');
    assert.equal(rows.vision.value, 'ollama · llava:7b');
    assert.equal(rows.vision.available, false);
    assert.equal(rows.vision.detail, 'connection refused');
  });

  it('shows no value for a disabled provider, and points at the docs', () => {
    assert.equal(rows.llm.value, '');
    assert.match(rows.llm.setup, /LLM_PROVIDER/);
    assert.match(rows.llm.docs, /CONFIGURATION\.md/);
  });

  it('is empty while the status is unknown', () => {
    assert.deepEqual(providerRows(null), []);
  });

  it('treats a missing entry as unavailable', () => {
    const [ffmpeg] = providerRows({});
    assert.equal(ffmpeg.available, false);
  });
});

describe('setupSummary', () => {
  it('names the optional providers that are not set up', () => {
    const summary = setupSummary(providerRows(STATUS));
    assert.equal(summary.ok, true);
    assert.match(summary.text, /Visual tagging, Director LLM/);
  });

  it('says so when everything is ready', () => {
    const all = Object.fromEntries(
      Object.entries(STATUS).map(([k, v]) => [k, { ...v, available: true }]),
    );
    assert.equal(setupSummary(providerRows(all)).text, 'Everything is set up');
  });

  it('flags a missing FFmpeg as blocking', () => {
    const summary = setupSummary(
      providerRows({ ...STATUS, ffmpeg: { available: false, detail: 'not found' } }),
    );
    assert.equal(summary.ok, false);
    assert.match(summary.text, /FFmpeg is missing/);
  });
});
