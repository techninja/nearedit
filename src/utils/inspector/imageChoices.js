/**
 * The stills of the open project, as an image parameter offers them.
 * @module utils/inspector/imageChoices
 */

import { getLibrary } from '#utils/media/library.js';

/**
 * Pick the images out of a media list.
 * @param {{ type: string, filePath: string, filename: string }[]} items
 * @returns {{ path: string, name: string }[]} Sorted by name
 */
export function imagesOf(items) {
  return items
    .filter((item) => item.type === 'image')
    .map((item) => ({ path: item.filePath, name: item.filename }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** @type {{ items: any, choices: { path: string, name: string }[] }} */
let cached = { items: null, choices: [] };

/**
 * @returns {{ path: string, name: string }[]} The same array until the
 *   library changes, so controls that receive it do not re-render for nothing
 */
export function imageChoices() {
  const items = getLibrary();
  if (cached.items !== items) cached = { items, choices: imagesOf(items) };
  return cached.choices;
}
