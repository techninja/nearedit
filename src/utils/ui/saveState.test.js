import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { saveIndicator } from './saveState.js';

describe('saveIndicator', () => {
  it('shows nothing before an adaptation is loaded', () => {
    assert.equal(saveIndicator({ loaded: false, dirty: true, saveError: 'x' }).kind, 'none');
  });

  it('is "saved" when clean', () => {
    const state = saveIndicator({ loaded: true, dirty: false, saveError: '' });
    assert.equal(state.kind, 'saved');
    assert.equal(state.label, 'Saved');
  });

  it('is "saving" while changes wait to be written', () => {
    assert.equal(saveIndicator({ loaded: true, dirty: true, saveError: '' }).kind, 'saving');
  });

  it('puts a failed save before everything else and carries the reason', () => {
    const state = saveIndicator({ loaded: true, dirty: true, saveError: 'Invalid edl' });
    assert.equal(state.kind, 'error');
    assert.match(state.detail, /Invalid edl/);
    assert.equal(saveIndicator({ loaded: true, dirty: false, saveError: 'offline' }).kind, 'error');
  });
});
