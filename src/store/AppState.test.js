import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';

/** In-memory localStorage, installed before the models are first read. */
const memory = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
});

const { default: AppState, APP_STATE_KEY } = await import('./AppState.js');
const { default: UserPrefs, USER_PREFS_KEY } = await import('./UserPrefs.js');

describe('AppState', () => {
  beforeEach(() => {
    memory.clear();
    store.clear(AppState);
    store.clear(UserPrefs);
  });

  it('starts from defaults when nothing is stored', () => {
    const state = store.get(AppState);
    assert.equal(store.ready(state), true);
    assert.equal(state.theme, 'system');
    assert.equal(state.dockWidth, 0);
    assert.equal(state.dockTab, 'media');
    assert.equal(state.sheetOpen, false);
  });

  it('persists a change under the key index.html reads', async () => {
    await store.set(AppState, { theme: 'dark', dockWidth: 412 });
    const saved = JSON.parse(memory.get(APP_STATE_KEY));
    assert.equal(saved.theme, 'dark');
    assert.equal(saved.dockWidth, 412);
    assert.equal(saved.timelineHeight, 0, 'untouched fields are saved with their defaults');
  });

  it('reads back what a previous session stored, ignoring unknown fields', () => {
    memory.set(APP_STATE_KEY, JSON.stringify({ theme: 'light', panelHeight: 300, dockTab: 'director' }));
    const state = store.get(AppState);
    assert.equal(state.theme, 'light');
    assert.equal(state.dockTab, 'director');
    assert.equal('panelHeight' in state, false);
  });

  it('survives unreadable stored data', () => {
    memory.set(APP_STATE_KEY, '{not json');
    assert.equal(store.get(AppState).theme, 'system');
    memory.set(APP_STATE_KEY, '[1,2]');
    store.clear(AppState);
    assert.equal(store.get(AppState).theme, 'system');
  });
});

describe('UserPrefs', () => {
  beforeEach(() => {
    memory.clear();
    store.clear(UserPrefs);
  });

  it('defaults to asking about notifications and the standard preset', () => {
    const prefs = store.get(UserPrefs);
    assert.equal(prefs.notifications, 'ask');
    assert.equal(prefs.exportPreset, 'standard');
    assert.equal(prefs.directorHintSeen, false);
  });

  it('persists changes', async () => {
    await store.set(UserPrefs, { notifications: 'off', directorHintSeen: true });
    const saved = JSON.parse(memory.get(USER_PREFS_KEY));
    assert.equal(saved.notifications, 'off');
    assert.equal(saved.directorHintSeen, true);
  });
});
