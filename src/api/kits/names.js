/**
 * Names as they arrive in a request: which kit an id means — a kit of the
 * library, a built-in kit, a project's own — and what a file may be called
 * inside a kit folder. Nothing here touches the disk. Pure.
 * @module api/kits/names
 */

import { BUILTIN_KITS, BUILTIN_PREFIX, isId } from '#utils/brand/index.js';
import { FILE_TYPES, FONT_TYPES, MAX_FILE_NAME, PROJECT_CHOICE } from './limits.js';

/**
 * A kit as a request names it.
 * @typedef {Object} KitRef
 * @property {'builtin'|'library'|'project'} source
 * @property {string} id - The built-in kit's name, the library id, or `project`
 * @property {string} ref - How it is written: `builtin:clean`, `acme`, `project`
 */

const BUILTIN_NAMES = BUILTIN_KITS.map((kit) => kit.id);
const DEVICE_NAME = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * Read a kit's name. A built-in kit is `builtin:<name>`; its bare name
 * means the same, since the library cannot hold a kit of that name.
 * @param {unknown} value
 * @returns {KitRef|null} null for anything that cannot name a kit. Whether
 *   the kit exists is the caller's question
 */
export function parseRef(value) {
  if (typeof value !== 'string') return null;
  if (value === PROJECT_CHOICE) return { source: 'project', id: value, ref: value };
  const bare = BUILTIN_NAMES.includes(value);
  if (bare || value.startsWith(BUILTIN_PREFIX)) {
    const id = bare ? value : value.slice(BUILTIN_PREFIX.length);
    return isId(id) ? { source: 'builtin', id, ref: `${BUILTIN_PREFIX}${id}` } : null;
  }
  return isId(value) ? { source: 'library', id: value, ref: value } : null;
}

/**
 * @param {string} name
 * @returns {string} The extension, lower case, without its dot; '' without one
 */
export function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * @param {string} name - A file name or a path
 * @returns {'picture'|'font'|''} What a kit may use the file as; '' for a
 *   kind of file a kit does not hold
 */
export function fileKind(name) {
  const extension = extensionOf(name);
  if (!FILE_TYPES.includes(extension)) return '';
  return FONT_TYPES.includes(extension) ? 'font' : 'picture';
}

/**
 * Reduce a file name from a request to one that is safe inside a kit
 * folder: its last path segment, with letters, digits, `.`, `_`, `-` and
 * spaces kept and everything else replaced, no leading dot, not too long.
 * @param {unknown} value - As the client named the file; may hold slashes,
 *   backslashes, `..`, control characters
 * @returns {string} '' when nothing usable is left or the kind of file is
 *   not one a kit holds
 */
export function safeFileName(value) {
  if (typeof value !== 'string') return '';
  const last = value.split(/[/\\]/).filter(Boolean).pop() || '';
  const plain = last
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._ -]/gu, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+/, '')
    .trim();
  const extension = extensionOf(plain);
  if (!fileKind(plain)) return '';
  const stem = plain.slice(0, plain.length - extension.length - 1);
  const kept = stem.slice(0, MAX_FILE_NAME - extension.length - 1).replace(/[.\s]+$/, '');
  if (!kept) return '';
  // Names Windows reads as devices (`nul.png`) are kept away from.
  return `${DEVICE_NAME.test(kept) ? '_' : ''}${kept}.${extension}`;
}

/**
 * A file's name as `files` lists one that sits directly in a kit folder.
 * @param {unknown} value
 * @returns {string} The name; '' for anything that is not the plain name of
 *   a logo or font file — a path, a hidden file, another kind of file
 */
export function plainFileName(value) {
  if (typeof value !== 'string' || /[/\\\0]/.test(value) || value.startsWith('.')) return '';
  return fileKind(value) ? value : '';
}
