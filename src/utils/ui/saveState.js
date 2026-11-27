/**
 * The editor header's save indicator, derived from `ProjectState`. Pure.
 * @module utils/ui/saveState
 */

/**
 * @typedef {Object} SaveIndicator
 * @property {'none'|'saved'|'saving'|'error'} kind
 * @property {string} label - Short text beside the icon
 * @property {string} detail - Tooltip / full explanation
 */

/**
 * @param {{ loaded: boolean, dirty: boolean, saveError: string }} project
 * @returns {SaveIndicator}
 */
export function saveIndicator({ loaded, dirty, saveError }) {
  if (!loaded) return { kind: 'none', label: '', detail: '' };
  if (saveError)
    return {
      kind: 'error',
      label: 'Not saved',
      detail: `The last save failed: ${saveError}. Your changes are still here — retry to save them.`,
    };
  // Changes are saved a moment after each edit, so "unsaved" is "saving".
  if (dirty) return { kind: 'saving', label: 'Saving…', detail: 'Saving your changes' };
  return { kind: 'saved', label: 'Saved', detail: 'All changes are saved on the server' };
}
