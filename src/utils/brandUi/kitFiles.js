/**
 * A kit's files and the preview. A kit's revision covers the names of its
 * files, not what is in them (docs/app-spec/BRAND.md § Limits): a logo
 * replaced under the name it had changes no document, so nothing would be
 * painted again and the preview would go on showing the picture it had
 * decoded. Whoever sends a kit's files, or removes them, says so here, and
 * the preview reads the pictures among them afresh (`dropStill`).
 * @module utils/brandUi/kitFiles
 */

import { dropStill } from '#utils/playback/imageCache.js';
import { pictureUrl } from '#utils/playback/mediaUrl.js';

/**
 * The picture files a kit shows: its logos, as media paths.
 * @param {{ tokens?: any }|null|undefined} effective - A kit as the server
 *   resolves it, its files as paths
 * @returns {string[]} Each once
 */
export function pictureFiles(effective) {
  const logo = effective?.tokens?.logo || {};
  const paths = ['main', 'mark']
    .map((slot) => logo[slot])
    .filter((path) => typeof path === 'string' && path !== '');
  return [...new Set(paths)];
}

/**
 * Files of a kit were replaced or removed: have the preview read the
 * pictures among them again.
 * @param {{ tokens?: any }|null|undefined} effective - The kit they belong to
 * @param {Iterable<string>} [names] - The names of the files that changed;
 *   without them, every picture of the kit
 * @returns {string[]} The media paths that were dropped
 */
export function refreshPictures(effective, names) {
  const changed = names ? new Set(names) : null;
  const paths = pictureFiles(effective).filter(
    (path) => !changed || changed.has(path.split(/[\\/]/).pop() || ''),
  );
  for (const path of paths) dropStill(pictureUrl(path));
  return paths;
}
