/**
 * List behaviour of the media bin: what is listed, picking rows with the
 * pointer and the keyboard, and adding picked files to the timeline.
 * These act on the `<media-bin>` host; the pure parts live in filter.js,
 * listSelection.js and virtualRows.js.
 * @module utils/media/binList
 */

import { addToTimeline } from '#utils/media/addToTimeline.js';
import { filterMedia, sortMedia } from '#utils/media/filter.js';
import { getMediaItem, libraryStatus } from '#utils/media/library.js';
import { clickSelection, stepSelection } from '#utils/media/listSelection.js';
import { getMarks, markedRange } from '#utils/media/ranges.js';
import { scrollToRow } from '#utils/media/virtualRows.js';

/** Event that opens or closes the quick look (footer button, Space on the list). */
const TOGGLE_LOOK = 'media-toggle-look';

/** Row height in pixels; must match `media-row` in media-row.css. */
export const ROW_HEIGHT = 44;

/**
 * @typedef {Object} BinListHost
 * @property {import('#utils/media/library.js').MediaItem[]} library
 * @property {string} query
 * @property {string} type
 * @property {string} sort
 * @property {string[]} selected - Picked file paths, in pick order
 * @property {string} anchor
 * @property {number} listTop - Scroll position of the list, pixels
 * @property {number} viewHeight
 */

/** @typedef {BinListHost & HTMLElement} Host */

/**
 * The files the list shows, in display order.
 * @param {BinListHost} host
 * @returns {import('#utils/media/library.js').MediaItem[]}
 */
export function listedItems({ library, query, type, sort }) {
  return sortMedia(filterMedia(library, { query, type }), /** @type {any} */ (sort));
}

/**
 * What to say when there are no rows to show.
 * @param {BinListHost} host
 * @returns {string}
 */
export function emptyMessage(host) {
  const { loading, error, projectId } = libraryStatus();
  if (error) return `The media list could not be loaded: ${error}`;
  if (loading) return 'Loading media…';
  if (!projectId) return 'Open a project to see its media.';
  if (!host.library.length)
    return 'No media in this project yet. Put video, audio or image files in the project folder, then reload.';
  return 'No file matches the search and filter.';
}

/**
 * Add files to the timeline at the edit cursor, each with its marked range.
 * @param {string[]} paths - In playing order
 * @returns {number} How many were placed
 */
export function addPaths(paths) {
  const entries = [];
  for (const path of paths) {
    const item = getMediaItem(path);
    if (item) entries.push({ item, ...markedRange(getMarks(path), item.duration) });
  }
  return addToTimeline(entries).placed;
}

/**
 * Store a new selection. Keyboard moves also bring its last row into view;
 * pointer picks never scroll, so the row stays under a double-click.
 * @param {Host} host
 * @param {import('#utils/media/listSelection.js').ListSelection} next
 * @param {string[]} [reveal] - Display order, when the row should be revealed
 */
function select(host, next, reveal) {
  host.selected = next.selected;
  host.anchor = next.anchor;
  const index = (reveal || []).indexOf(next.selected[next.selected.length - 1]);
  const list = host.querySelector('.media-bin-list');
  if (index < 0 || !list) return;
  const view = {
    rowHeight: ROW_HEIGHT,
    scrollTop: list.scrollTop,
    viewportHeight: list.clientHeight,
  };
  const top = scrollToRow(index, view);
  if (top !== list.scrollTop) list.scrollTop = top;
}

/**
 * A row was clicked (`media-pick`).
 * @param {Host} host
 * @param {CustomEvent} event
 */
export function handlePick(host, event) {
  const order = listedItems(host).map((item) => item.filePath);
  const current = { selected: host.selected, anchor: host.anchor };
  select(host, clickSelection(order, current, event.detail.path, event.detail));
}

/**
 * Keyboard on the list: arrows move (Shift extends), Home/End jump,
 * Ctrl+A selects all, Enter adds the selection to the timeline, Space
 * opens or closes the quick look.
 * @param {Host} host
 * @param {KeyboardEvent} event
 */
export function handleListKeydown(host, event) {
  const order = listedItems(host).map((item) => item.filePath);
  const current = { selected: host.selected, anchor: host.anchor };
  const { key } = event;
  const steps = { ArrowDown: 1, ArrowUp: -1, Home: -order.length, End: order.length };
  if (key in steps) select(host, stepSelection(order, current, steps[key], event.shiftKey), order);
  else if (key === 'a' && (event.ctrlKey || event.metaKey)) host.selected = order;
  else if (key === ' ')
    event.currentTarget.dispatchEvent(new CustomEvent(TOGGLE_LOOK, { bubbles: true }));
  else if (key === 'Enter' && host.selected.length) addPaths(host.selected);
  else return;
  event.preventDefault();
  event.stopPropagation();
}
