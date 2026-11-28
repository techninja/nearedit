/**
 * The transcript panel's working picture: the text of the file it shows,
 * how that file is used on the timeline, the current selection and search
 * hits. Render and every handler ask for it; the expensive parts are
 * remembered between calls (see panelView.js).
 * @module utils/transcript/panelContext
 */

import { getDoc } from '#utils/editor/session.js';
import { selectedRange, transcriptText, transcriptUsage } from './panelView.js';
import { searchUnits } from './search.js';

/**
 * @typedef {Object} TranscriptPanelHost
 * @property {string} file - Source file shown, '' for none
 * @property {string} focusClip - Selected clip that plays `file`, '' without one
 * @property {string} track - Track of the chain last shown, to stay on it
 * @property {string} note - Why a selected clip has no transcript (`title`…)
 * @property {string} pinnedPath - File pinned from the library, '' when following
 * @property {Record<string, any>} sidecar - The file's sidecar, {} until loaded
 * @property {boolean} loading
 * @property {number} revision - Bumped when the document or library changed
 * @property {number} anchor - Where the word selection started, -1 for none
 * @property {number} head - Where it ends
 * @property {number} current - Unit under the playhead, -1 for none
 * @property {number} editing - Unit being corrected, -1 for none
 * @property {boolean} extend - Taps extend the selection
 * @property {string} query - Search text
 * @property {number} match - Current search hit, -1 for none
 * @property {boolean} silence - The remove-silences form is open
 * @property {number} threshold
 * @property {number} padding
 * @property {import('#utils/captionsUi/transcribe.js').TranscribeState} jobs - Transcriptions
 *   under way, by file (started here or from the inspector's Captions group)
 * @property {Record<string, any>} status - GET /intelligence/status
 * @property {string} message - Short feedback line (copied, saved, failed…)
 */

/** @typedef {TranscriptPanelHost & HTMLElement} Host */

/** @type {{ units: any, query: string, matches: import('./search.js').Match[] }} */
let lastSearch = { units: null, query: '', matches: [] };

/**
 * @param {import('./units.js').Unit[]} units
 * @param {string} query
 * @returns {import('./search.js').Match[]} Remembered while units and query stay the same
 */
function findMatches(units, query) {
  if (lastSearch.units !== units || lastSearch.query !== query) {
    lastSearch = { units, query, matches: searchUnits(units, query) };
  }
  return lastSearch.matches;
}

/**
 * @param {TranscriptPanelHost} host
 * @returns {import('./panelView.js').TranscriptText & {
 *   chain: import('./usage.js').Chain, states: number[],
 *   matches: import('./search.js').Match[],
 *   range: { first: number, last: number }|null,
 *   onTimeline: boolean, editable: boolean,
 *   edit: import('./actions.js').EditContext }}
 */
export function panelContext(host) {
  const text = transcriptText(host.file ? host.sidecar : null);
  const prefer = { focusClipId: host.focusClip, trackId: host.track };
  const { chain, states } = transcriptUsage(getDoc(), host.file, text.units, prefer);
  const onTimeline = chain.segments.length > 0;
  return {
    ...text,
    chain,
    states,
    matches: findMatches(text.units, host.query),
    range: selectedRange(host.anchor, host.head, text.units.length),
    onTimeline,
    editable: onTimeline && !chain.locked,
    edit: {
      file: host.file,
      units: text.units,
      edges: text.edges,
      chain,
      focusClipId: host.focusClip,
      sidecar: host.sidecar,
    },
  };
}

/**
 * Search hits that touch a paragraph, as the `first:last;…` string the
 * paragraph component takes.
 * @param {import('./search.js').Match[]} matches
 * @param {{ first: number, last: number }} paragraph
 * @returns {string}
 */
export function hitsIn(matches, paragraph) {
  return matches
    .filter((m) => m.last >= paragraph.first && m.first <= paragraph.last)
    .map((m) => `${m.first}:${m.last}`)
    .join(';');
}
