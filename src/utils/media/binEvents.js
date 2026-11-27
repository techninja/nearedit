/**
 * What the media bin does when its parts speak up: toolbar, rows, quick
 * look and analysis strip report with events, these handlers act on the
 * `<media-bin>` host. Also the bin's life cycle (subscriptions, sizing).
 * @module utils/media/binEvents
 */

import { cancelAnalysis, providerNotice, runAnalysis } from '#utils/media/analysisRun.js';
import { intelligenceStatus, watchAnalysisJobs } from '#utils/media/analyze.js';
import { addPaths, listedItems } from '#utils/media/binList.js';
import { lookIsOpen } from '#utils/media/binParts.js';
import { getLibrary, loadLibrary, onLibraryChange } from '#utils/media/library.js';
import { pruneSelection } from '#utils/media/listSelection.js';
import { forgetSidecars } from '#utils/media/sidecars.js';
import { pinTranscript } from '#utils/transcript/pin.js';

/**
 * @typedef {import('#utils/media/binList.js').BinListHost & {
 *   job: Record<string, any>, notice: Record<string, any>, status: Record<string, any>,
 *   revision: number, look: 'auto'|'open'|'closed', compact: boolean }} MediaBinHost
 */

/** @typedef {MediaBinHost & HTMLElement} Host */

/** A bin shorter than this (pixels) shows the list or the quick look, not both… */
const COMPACT_BELOW = 560;
/** …unless it is this wide: then the two sit side by side (see media-bin.css). */
const WIDE_FROM = 640;

/**
 * Fetch which providers are usable; a missing one becomes a visible notice.
 * @param {Host} host
 * @param {boolean} [refresh]
 */
function loadStatus(host, refresh = false) {
  intelligenceStatus({ refresh })
    .then((status) => {
      host.status = status;
      if (!host.job.active) host.notice = providerNotice(status);
    })
    .catch((err) => console.warn('[media-bin] provider status is unknown:', err.message));
}

/**
 * Subscribe to the library and to analysis jobs, and track the list height.
 * @param {Host} host
 * @returns {() => void} Disconnect
 */
export function connectBin(host) {
  const libraryChanged = () => {
    host.revision++;
    // Files that left the library (another project, deleted) leave the selection.
    const known = getLibrary().map((item) => item.filePath);
    const kept = pruneSelection(known, { selected: host.selected, anchor: host.anchor });
    if (kept.selected.length !== host.selected.length) Object.assign(host, kept);
  };
  const stops = [onLibraryChange(libraryChanged), watchAnalysisJobs()];
  const sizes = new ResizeObserver(() => {
    const listHeight = host.querySelector('.media-bin-list')?.clientHeight || 0;
    if (listHeight !== host.viewHeight) host.viewHeight = listHeight;
    const { clientWidth: width, clientHeight: height } = host;
    const compact = height > 0 && height < COMPACT_BELOW && width < WIDE_FROM;
    if (compact !== host.compact) host.compact = compact;
  });
  sizes.observe(host);
  loadStatus(host);
  return () => {
    sizes.disconnect();
    for (const stop of stops) stop();
  };
}

/** @param {Host} host @param {CustomEvent} event - `media-filter` */
export function handleFilter(host, event) {
  Object.assign(host, event.detail);
  // What the filter hides is no longer selected: "Add" only adds what is seen.
  const order = listedItems(host).map((item) => item.filePath);
  Object.assign(host, pruneSelection(order, { selected: host.selected, anchor: host.anchor }));
  const list = host.querySelector('.media-bin-list');
  if (list) list.scrollTop = 0;
}

/** @param {Host} host - `media-refresh` */
export function handleRefresh(host) {
  forgetSidecars();
  loadLibrary();
  loadStatus(host, true);
}

/**
 * `media-add`: add the file — or, when it is part of a multi-selection,
 * the whole selection in the order it was picked.
 * @param {Host} host
 * @param {CustomEvent} event
 */
export function handleAdd(host, event) {
  const { path } = event.detail;
  addPaths(host.selected.length > 1 && host.selected.includes(path) ? host.selected : [path]);
}

/** @param {Host} host - The "add selected" button */
export function handleAddSelected(host) {
  addPaths(host.selected);
}

/**
 * `media-analyze`: `{ scope: 'all' }`, `{ scope: 'selected' }` or `{ paths }`.
 * @param {Host} host
 * @param {CustomEvent} event
 */
export function handleAnalyze(host, event) {
  const { scope, paths } = event.detail;
  const what = scope === 'all' ? {} : { paths: paths || host.selected };
  runAnalysis(what, (report) => Object.assign(host, report));
}

/** `media-cancel` */
export function handleCancel() {
  cancelAnalysis();
}

/** @param {Host} host - `media-dismiss` */
export function handleDismiss(host) {
  host.notice = {};
}

/** @param {Host} host - `media-marks`: rows show a "part" chip for marked files */
export function handleMarks(host) {
  host.revision++;
}

/** @param {Host} _host @param {CustomEvent} event - `media-transcript` */
export function handleTranscript(_host, event) {
  pinTranscript(event.detail.path);
}

/** @param {Host} host @param {Event} event - Scroll of the list */
export function handleScroll(host, event) {
  host.listTop = /** @type {HTMLElement} */ (event.target).scrollTop;
}

/** @param {Host} host - The quick look's show/hide button, or Space on the list */
export function handleToggleLook(host) {
  host.look = lookIsOpen(host) ? 'closed' : 'open';
}
