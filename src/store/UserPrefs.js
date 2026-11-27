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
 * @property {string} directorAction - Director action used last
 */

/** @type {import('hybrids').Model<UserPrefsShape>} */
const UserPrefs = {
  notifications: 'ask',
  exportPreset: 'standard',
  directorHintSeen: false,
  directorAction: '',
  [store.connect]: {
    get: () => readStored(USER_PREFS_KEY),
    set: (_id, values) => {
      writeStored(USER_PREFS_KEY, values);
      return values;
    },
  },
};

export default UserPrefs;

/**
 * Patch the preferences from plain code.
 * @param {Partial<UserPrefsShape>} patch
 */
export function setUserPrefs(patch) {
  store
    .set(UserPrefs, patch)
    .catch((err) => console.error('[prefs] could not update preferences:', err));
}
