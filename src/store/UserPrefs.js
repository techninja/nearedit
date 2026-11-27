/**
 * User preferences — singleton, persisted to localStorage. Choices the
 * user made that should survive a reload but are not layout.
 * @module store/UserPrefs
 */

import { store } from 'hybrids';
import { readStored, writeStored } from '#utils/ui/storage.js';

export const USER_PREFS_KEY = 'nearedit_userPrefs';

/**
 * @typedef {Object} UserPrefsShape
 * @property {'ask'|'on'|'off'} notifications - Desktop notifications for finished jobs
 * @property {string} exportPreset - Render preset chosen last
 * @property {boolean} directorHintSeen - The director's first-use hint was dismissed
 * @property {'nearedit'|'vegas'} keymapPreset - Keyboard layout (`#utils/keyboard/presets.js`)
 * @property {'scroll'|'vegas'} wheelMode - Timeline wheel: scroll (Ctrl zooms), or zoom as Vegas does
 * @property {'track'|'marks'|'all'} rippleScope - What auto ripple carries along
 * @property {boolean} snapMarkers - Snapping includes markers and regions
 * @property {number} trackHeight - Lane height in pixels; 0 = the default for the pointer
 * @property {boolean} tracksMinimized - Lanes are at their smallest until restored
 */

/** @type {import('hybrids').Model<UserPrefsShape>} */
const UserPrefs = {
  notifications: 'ask',
  exportPreset: 'standard',
  directorHintSeen: false,
  keymapPreset: 'nearedit',
  wheelMode: 'scroll',
  rippleScope: 'track',
  snapMarkers: true,
  trackHeight: 0,
  tracksMinimized: false,
  [store.connect]: {
    get: () => readStored(USER_PREFS_KEY),
    set: (_id, values) => {
      writeStored(USER_PREFS_KEY, values);
      return values;
    },
  },
};

export default UserPrefs;

/** @returns {UserPrefsShape} The preferences as they are now */
export const getUserPrefs = () => store.get(UserPrefs);

/**
 * Patch the preferences from plain code.
 * @param {Partial<UserPrefsShape>} patch
 */
export function setUserPrefs(patch) {
  store
    .set(UserPrefs, patch)
    .catch((err) => console.error('[prefs] could not update preferences:', err));
}
