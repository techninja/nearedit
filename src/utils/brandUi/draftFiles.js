/**
 * The logo and font files a customisation has chosen but not saved yet.
 * They are kept as the browser's own `File`s, so the live preview can show
 * them at once and nothing is sent before "Save".
 * @module utils/brandUi/draftFiles
 */

import { kitState } from './kitState.js';

/** @type {Map<string, { file: Blob, url: string }>} By the name the draft gives the file */
const pending = new Map();

/** @returns {Map<string, Blob>} The files that wait to be saved, by name */
export const pendingFiles = () => new Map([...pending].map(([name, entry]) => [name, entry.file]));

/**
 * Keep a chosen file until it is saved; one of the same name is replaced.
 * @param {string} name
 * @param {Blob} file
 */
export function holdFile(name, file) {
  const before = pending.get(name);
  if (before) URL.revokeObjectURL(before.url);
  pending.set(name, { file, url: URL.createObjectURL(file) });
}

/** Forget the files that were chosen: they were saved, or never will be. */
export function dropPending() {
  for (const { url } of pending.values()) URL.revokeObjectURL(url);
  pending.clear();
}

/**
 * Where a file of the draft can be read from now: the browser's own
 * address for one that was just chosen, else the path the server gave the
 * file of that name in the project's kit as it is saved.
 * @param {string} name - As the draft names the file
 * @returns {string|undefined}
 */
export function fileUrlOf(name) {
  // The file's own name rides along, so a reader can tell what kind of file it is.
  if (pending.has(name)) return `${pending.get(name).url}#${encodeURIComponent(name)}`;
  const { kit, effective } = kitState.get();
  for (const slot of ['main', 'mark']) {
    if (kit?.tokens?.logo?.[slot] === name) return effective.tokens.logo?.[slot] || undefined;
  }
  const face = (kit?.fonts || []).find((/** @type {any} */ entry) => entry.file === name);
  const same = (/** @type {any} */ other) =>
    other.family === face.family && other.weight === face.weight && other.style === face.style;
  return face ? effective.fonts?.find(same)?.file : undefined;
}
