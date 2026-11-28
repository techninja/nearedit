/**
 * Adding a web clip from the Create tab: read the address, put a clip with
 * that page and size at the edit cursor (one undo step), select it,
 * remember the address for this project and open the web editor on it.
 * @module utils/webUi/addClip
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { newClipIds } from '#utils/edl/selection.js';
import { insertWebClip } from '#utils/edl/webClip.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getView, setSelection } from '#utils/editor/view.js';
import { readAddress, rememberAddress } from './address.js';
import { openWebEditor } from './editorState.js';
import { sizePatch } from './sizes.js';

/**
 * @param {string} address - As typed
 * @param {string} sizeId - One of `WEB_SIZES`
 * @param {{ open?: boolean }} [opts] - `open: false` leaves the web editor closed
 * @returns {{ clipId: string, url: string, message: string }} `clipId` is ''
 *   when nothing was added, and `message` says why
 */
export function addWebClip(address, sizeId, { open = true } = {}) {
  const { url, problem } = readAddress(address);
  if (!url) return { clipId: '', url, message: problem };
  const view = getView();
  const before = getDoc();
  const next = insertWebClip(
    before,
    { url, ...sizePatch(sizeId) },
    { time: view.cursorPosition || 0, autoCrossfade: view.autoCrossfade },
  );
  const [clipId] = newClipIds(before, next);
  if (!clipId) return { clipId: '', url, message: 'The web clip could not be added' };
  edit(() => next);
  setSelection([clipId], { expand: false });
  rememberAddress(store.get(ProjectState).projectId, url);
  if (open) openWebEditor(clipId);
  return { clipId, url, message: `Added a web clip of ${url}` };
}
