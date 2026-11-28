import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { rememberSubtitles, rememberedSubtitles, subtitleChoice } from './exportSubtitles.js';

describe('the subtitle choice of an export', () => {
  /** @type {Map<string, string>} */
  let kept;
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  beforeEach(() => {
    kept = new Map();
    const storage = {
      getItem: (/** @type {string} */ key) => kept.get(key) ?? null,
      setItem: (/** @type {string} */ key, /** @type {string} */ value) => kept.set(key, value),
    };
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  });
  afterEach(() => {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete (/** @type {any} */ (globalThis).localStorage);
  });

  it('knows none, .srt and .vtt, and nothing else', () => {
    assert.deepEqual(['', 'srt', 'vtt'].map(subtitleChoice), ['', 'srt', 'vtt']);
    assert.deepEqual(
      ['docx', 'SRT', undefined, null, 3, {}].map(subtitleChoice),
      Array(6).fill(''),
    );
  });

  it('is none until one is made', () => {
    assert.equal(rememberedSubtitles(), '');
  });

  it('is remembered on this computer, beside whatever else is kept there', () => {
    kept.set('nearedit_captions', JSON.stringify({ other: 1 }));
    rememberSubtitles('vtt');
    assert.equal(rememberedSubtitles(), 'vtt');
    assert.deepEqual(JSON.parse(kept.get('nearedit_captions') ?? ''), {
      other: 1,
      exportSubtitles: 'vtt',
    });
    rememberSubtitles('');
    assert.equal(rememberedSubtitles(), '');
  });

  it('never remembers or reads back something that is not a subtitle file', () => {
    rememberSubtitles('docx');
    assert.equal(JSON.parse(kept.get('nearedit_captions') ?? '').exportSubtitles, '');
    kept.set('nearedit_captions', JSON.stringify({ exportSubtitles: 'docx' }));
    assert.equal(rememberedSubtitles(), '');
  });
});
