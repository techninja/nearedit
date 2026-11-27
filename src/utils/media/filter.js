/**
 * Searching, filtering and sorting the media list. Pure and isomorphic.
 * @module utils/media/filter
 */

/** @typedef {import('./library.js').MediaItem} MediaItem */

/** @typedef {'name'|'duration'|'type'|'size'|'date'} SortKey */

export const MEDIA_TYPES = ['video', 'audio', 'image', 'text'];

/** Sort choices offered by the bin, in menu order. */
export const SORT_KEYS = [
  { key: 'name', label: 'Name' },
  { key: 'date', label: 'Newest' },
  { key: 'duration', label: 'Longest' },
  { key: 'size', label: 'Largest' },
  { key: 'type', label: 'Type' },
];

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Items of one type whose name, folder or tags contain every search word.
 * @param {MediaItem[]} items
 * @param {{ query?: string, type?: string }} [criteria] - `type` is a media
 *   type or `all`
 * @returns {MediaItem[]}
 */
export function filterMedia(items, criteria = {}) {
  const { query = '', type = 'all' } = criteria;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (type !== 'all' && item.type !== type) return false;
    if (!words.length) return true;
    const haystack = [item.relativePath || item.filename, ...(item.tags || [])]
      .join('\n')
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * How many items there are of each type.
 * @param {MediaItem[]} items
 * @returns {Record<string, number>} Keys: `all` and every media type
 */
export function typeCounts(items) {
  /** @type {Record<string, number>} */
  const counts = { all: items.length };
  for (const type of MEDIA_TYPES) counts[type] = 0;
  for (const item of items) counts[item.type] = (counts[item.type] || 0) + 1;
  return counts;
}

/** @type {(item: any) => number} When the file was last changed (API field `mtime`) */
const modified = (item) => item.mtime || 0;

/** @type {Record<string, (a: MediaItem, b: MediaItem) => number>} */
const COMPARE = {
  name: () => 0,
  date: (a, b) => modified(b) - modified(a),
  duration: (a, b) => (b.duration || 0) - (a.duration || 0),
  size: (a, b) => (b.size || 0) - (a.size || 0),
  type: (a, b) => MEDIA_TYPES.indexOf(a.type) - MEDIA_TYPES.indexOf(b.type),
};

/**
 * Sort a copy of the list. Every order falls back to the natural name
 * order (`clip2` before `clip10`), so equal items never jump around.
 * @param {MediaItem[]} items
 * @param {SortKey} [key='name']
 * @returns {MediaItem[]}
 */
export function sortMedia(items, key = 'name') {
  const compare = COMPARE[key] || COMPARE.name;
  const name = (/** @type {MediaItem} */ item) => item.relativePath || item.filename || '';
  return [...items].sort((a, b) => compare(a, b) || byName.compare(name(a), name(b)));
}
