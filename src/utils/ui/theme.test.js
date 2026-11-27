import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyTheme, resolveTheme, toggledPreference } from './theme.js';

describe('resolveTheme', () => {
  it('follows the system for "system" and unknown values', () => {
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
    assert.equal(resolveTheme('', true), 'dark');
    assert.equal(resolveTheme('purple', false), 'light');
  });

  it('honours an explicit choice whatever the system says', () => {
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
  });
});

describe('toggledPreference', () => {
  it('pins the opposite of what is showing', () => {
    assert.equal(toggledPreference('system', true), 'light');
    assert.equal(toggledPreference('system', false), 'dark');
  });

  it('returns to "system" when the choice matches the OS again', () => {
    assert.equal(toggledPreference('light', true), 'system');
    assert.equal(toggledPreference('dark', false), 'system');
  });

  it('flips an explicit choice that already matches the OS', () => {
    assert.equal(toggledPreference('dark', true), 'light');
    assert.equal(toggledPreference('light', false), 'dark');
  });

  it('always changes what is showing', () => {
    for (const preference of ['system', 'light', 'dark']) {
      for (const systemDark of [true, false]) {
        const next = toggledPreference(preference, systemDark);
        assert.notEqual(
          resolveTheme(next, systemDark),
          resolveTheme(preference, systemDark),
          `${preference} with systemDark=${systemDark}`,
        );
      }
    }
  });
});

describe('applyTheme', () => {
  it('resolves without a document (Node)', () => {
    assert.equal(applyTheme('dark'), 'dark');
    assert.equal(applyTheme('light'), 'light');
  });
});
