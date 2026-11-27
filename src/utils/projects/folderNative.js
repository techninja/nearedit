/**
 * The server's own "choose folder" dialog (`POST /api/pick-folder`) as a
 * shortcut in the folder browser, for when the browser runs on the server
 * machine itself.
 * @module utils/projects/folderNative
 */

import { pickNativeFolder } from '#utils/projects/api.js';
import { browseTo, folderPickState } from '#utils/projects/folderPick.js';

/**
 * Whether the server's own folder dialog is worth offering: it only opens
 * for a browser on the server machine itself.
 * @returns {boolean}
 */
export function nativeDialogOffered() {
  const host = globalThis.location?.hostname || '';
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
  return local && !folderPickState.get().nativeTried;
}

/** Ask the server to open its desktop folder dialog and show the result. */
export async function openNativeDialog() {
  folderPickState.set({ nativeBusy: true, error: '' });
  try {
    const picked = await pickNativeFolder();
    if (!picked) {
      const error =
        'No folder came back from the system dialog — choose one from the list instead.';
      folderPickState.set({ nativeTried: true, error });
    } else if (!picked.browsable) {
      const error = `${picked.path} is outside the folders this server may use (BROWSE_ROOTS).`;
      folderPickState.set({ error });
    } else await browseTo(picked.path);
  } catch (err) {
    folderPickState.set({ nativeTried: true, error: err.message });
  } finally {
    folderPickState.set({ nativeBusy: false });
  }
}
