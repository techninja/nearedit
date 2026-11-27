/**
 * Keeping the transcript panel in step with the editor: which file it
 * shows (selection, cursor or a pinned file) and the word under the
 * playhead. View state changes on every playback frame, so the
 * work done per change is kept small and the host is only written to when
 * something it shows really changed.
 * @module utils/transcript/panelSync
 */

import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { getDoc, onDocChange } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { watchAnalysisJobs } from '#utils/media/analyze.js';
import { getMediaItem, onLibraryChange } from '#utils/media/library.js';
import { onSidecarChange } from '#utils/media/sidecars.js';
import { panelContext } from './panelContext.js';
import { loadStatus, loadTranscript, revealUnit } from './panelLoad.js';
import { onPinChange, pinnedTranscript } from './pin.js';
import { resolveSubject } from './subject.js';
import { unitAt } from './units.js';
import { OFF, timelineToSource } from './usage.js';

/** @typedef {import('./panelContext.js').Host} Host */
/** @typedef {import('#store/ViewState.js').ViewStateShape} View */

/**
 * Decide which file and clip the panel shows. A file stays on screen when
 * the selection is cleared, until something else with speech is picked.
 * @param {Host} host
 * @param {View} view
 */
function syncSubject(host, view) {
  const hasTranscript = (/** @type {string} */ file) => !!getMediaItem(file)?.analysis?.transcript;
  const context = { edl: getDoc(), selection: view.selection, cursor: view.cursorPosition };
  const subject = resolveSubject({ ...context, pinned: pinnedTranscript(), hasTranscript });
  const sticky = subject.from === 'none' && host.file;
  const file = sticky ? host.file : subject.file;
  const next = { focusClip: subject.clipId, note: subject.note, pinnedPath: pinnedTranscript() };
  for (const key of Object.keys(next)) if (host[key] !== next[key]) host[key] = next[key];
  if (file !== host.file) showFile(host, file);
}

/**
 * Point the panel at another file (or none), starting from a clean slate.
 * @param {Host} host
 * @param {string} file
 */
function showFile(host, file) {
  Object.assign(host, { file, sidecar: {}, anchor: -1, head: -1, current: -1, editing: -1 });
  Object.assign(host, { match: -1, track: '', message: '' });
  loadTranscript(host);
  loadStatus(host);
}

/**
 * Highlight the unit under the playhead and keep it in view.
 * @param {Host} host
 * @param {View} view
 */
function syncCurrent(host, view) {
  const { units, chain, states } = panelContext(host);
  if (chain.trackId && chain.trackId !== host.track) host.track = chain.trackId;
  if (!chain.segments.length) return; // off the timeline the preview player drives `current`
  const fps = getDoc().fps || 30;
  const at = timelineToSource(chain.segments, view.playheadPosition);
  let current = at ? unitAt(units, at.sourceTime + 1 / fps) : -1;
  // Just after a cut the last word to have started is one that was cut:
  // the word about to be spoken is the current one.
  if (current >= 0 && states[current] === OFF)
    current = states[current + 1] === OFF ? -1 : current + 1;
  if (current >= units.length) current = -1;
  if (current === host.current) return;
  host.current = current;
  if (current >= 0) revealUnit(host, current);
}

/**
 * Subscribe the panel to everything it follows.
 * @param {Host} host
 * @returns {() => void} Disconnect
 */
export function connectPanel(host) {
  let seen = '';
  // While a store observer runs, `store.get` still returns the previous
  // model: the new one is the observer's argument.
  const sync = (/** @type {View} */ view = getView()) => {
    const key = `${(view.selection || []).join()}|${view.cursorPosition}|${pinnedTranscript()}`;
    if (key !== seen) syncSubject(host, view);
    seen = key;
    syncCurrent(host, view);
  };
  const changed = () => {
    seen = '';
    host.revision++;
    sync();
  };
  const stops = [
    store.observe(ViewState, (_id, view) => view && sync(view)),
    onDocChange((_doc, info) => {
      // Another document: what was on screen only stays if it is pinned or selected.
      if (info.reason === 'load' && !pinnedTranscript() && host.file) showFile(host, '');
      changed();
    }),
    onLibraryChange(changed),
    onPinChange(changed),
    onSidecarChange((path) => (!path || path === host.file) && loadTranscript(host)),
    watchAnalysisJobs(),
  ];
  loadStatus(host);
  sync();
  return () => stops.forEach((stop) => stop());
}
