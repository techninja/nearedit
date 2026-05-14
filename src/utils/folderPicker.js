/**
 * Folder picker — uses File System Access API (Chromium) or falls back
 * to a server-side OS dialog.
 * @module utils/folderPicker
 */

/**
 * Prompt the user to pick a folder. Returns the absolute path.
 * Tries browser API first, then server-side dialog.
 * @returns {Promise<string|null>}
 */
export async function pickFolder() {
  // Try browser File System Access API (Chromium)
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      // The handle doesn't expose the absolute path directly,
      // but we can resolve it via the server
      const path = await resolveHandlePath(handle);
      return path;
    } catch (e) {
      if (e.name === 'AbortError') return null;
      // Fall through to server picker
    }
  }

  // Fallback: server-side OS dialog
  try {
    const res = await fetch('/api/pick-folder', { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.path || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a FileSystemDirectoryHandle to an absolute path via the server.
 * We send the directory name and let the server search for it,
 * or fall back to the server picker.
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<string|null>}
 */
async function resolveHandlePath(handle) {
  // The File System Access API doesn't give absolute paths for security.
  // Best we can do client-side is get the name. Use server picker instead.
  const res = await fetch('/api/pick-folder', { method: 'POST' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.path || null;
}
