/**
 * A project's own kit, remembered so it can be offered again. Choosing
 * another kit keeps the project's own on disk, but the server only tells
 * about the kit in use — so the editor notes, per project, that there is
 * one (its name and colours) the moment it sees it, and the Brand dialog
 * lists it next to the others from then on.
 * @module utils/brandUi/ownKit
 */

import { readStored, writeStored } from '#utils/ui/storage.js';

/** localStorage key: `{ <projectId>: { name, colors } }`. */
export const OWN_KITS_KEY = 'nearedit_brandOwnKits';
/** Projects remembered at most. */
const MOST = 200;

/**
 * Note that a project has a kit of its own.
 * @param {string} projectId
 * @param {{ name?: string, tokens?: { color?: Record<string, string> } }} effective - It, resolved
 */
export function rememberOwnKit(projectId, effective) {
  if (!projectId) return;
  const others = Object.entries(readStored(OWN_KITS_KEY)).filter(([id]) => id !== projectId);
  const kept = Object.fromEntries(others.slice(-MOST + 1));
  const note = { name: effective.name || '', colors: effective.tokens?.color || {} };
  writeStored(OWN_KITS_KEY, { ...kept, [projectId]: note });
}

/** The project turned out to have no kit of its own. @param {string} projectId */
export function forgetOwnKit(projectId) {
  const { [projectId]: gone, ...others } = readStored(OWN_KITS_KEY);
  if (gone) writeStored(OWN_KITS_KEY, others);
}

/**
 * @param {string} projectId
 * @returns {{ name: string, colors: Record<string, string> }|null} What was
 *   noted about the project's own kit; null when none is known
 */
export function ownKitOf(projectId) {
  const note = readStored(OWN_KITS_KEY)[projectId];
  return note && typeof note === 'object'
    ? { name: note.name || '', colors: note.colors || {} }
    : null;
}
