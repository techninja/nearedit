/**
 * What the transcript panel does when its toolbar, action bar and forms
 * speak up: run an edit, search, copy, pin a file, remove silences. These
 * act on the `<transcript-panel>` host. Transcribing and saving
 * corrections live in panelJobs.js.
 * @module utils/transcript/panelCommands
 */

import { cutUnits, keepUnits, tighten } from './actions.js';
import { copyToClipboard } from './clipboard.js';
import { transcriptText as plainText } from './paragraphs.js';
import { panelContext } from './panelContext.js';
import { goToUnit } from './panelPointer.js';
import { revealUnit } from './panelLoad.js';
import { pinTranscript } from './pin.js';
import { addUnits, markUnits } from './placeActions.js';
import { firstMatchFrom, stepMatch } from './search.js';
import { rangeText } from './units.js';

/** @typedef {import('./panelContext.js').Host} Host */

/**
 * Copy text and say so.
 * @param {Host} host
 * @param {string} text
 */
function copyText(host, text) {
  copyToClipboard(text)
    .then(() => (host.message = 'Copied to the clipboard'))
    .catch((err) => (host.message = `Could not copy: ${err.message}`));
}

/**
 * Run a named action on the selection: `cut`, `keep`, `add`, `marker`,
 * `copy`, `edit`, `extend`, `clear`.
 * @param {Host} host
 * @param {string} action
 */
export function runAction(host, action) {
  const { edit, units, range, paragraphs, editable } = panelContext(host);
  if (action === 'copy')
    return copyText(
      host,
      range ? rangeText(units, range.first, range.last) : plainText(units, paragraphs),
    );
  if (action === 'extend') return void (host.extend = !host.extend);
  if (action === 'clear' || !range)
    return void Object.assign(host, { anchor: -1, head: -1, extend: false });
  if (action === 'edit') return void (host.editing = range.first);
  const edits = { cut: cutUnits, keep: keepUnits, add: addUnits, marker: markUnits };
  if (!edits[action] || ((action === 'cut' || action === 'keep') && !editable)) return;
  const done = edits[action](edit, range.first, range.last);
  if (!done) host.message = 'Nothing changed — those words are not in the edit.';
  else if (action !== 'marker') Object.assign(host, { anchor: -1, head: -1, extend: false });
}

/** @param {Host} host @param {CustomEvent} event - `transcript-action` */
export function handleAction(host, event) {
  runAction(host, event.detail.action);
}

/** @param {Host} host @param {CustomEvent} event - `transcript-tool` */
export function handleTool(host, event) {
  if (event.detail.tool === 'silence') host.silence = !host.silence;
  else runAction(host, 'copy');
}

/** @param {Host} _host @param {CustomEvent} event - `transcript-pin` */
export function handlePin(_host, event) {
  pinTranscript(event.detail.path);
}

/** @param {Host} host @param {number} match - Show a search hit */
function showMatch(host, match) {
  host.match = match;
  const hit = panelContext(host).matches[match];
  if (hit) revealUnit(host, hit.first);
}

/** @param {Host} host @param {CustomEvent} event - `transcript-search` */
export function handleSearch(host, event) {
  host.query = event.detail.query;
  showMatch(host, firstMatchFrom(panelContext(host).matches, Math.max(0, host.current)));
}

/** @param {Host} host @param {CustomEvent} event - `transcript-step` */
export function handleStep(host, event) {
  const { matches } = panelContext(host);
  showMatch(host, stepMatch(matches.length, host.match, event.detail.direction));
  const hit = matches[host.match];
  if (hit) goToUnit(host, hit.first);
}

/** @param {Host} host @param {CustomEvent} event - `transcript-silence-change` */
export function handleSilenceChange(host, event) {
  Object.assign(host, event.detail);
}

/** @param {Host} host - `transcript-silence-apply` */
export function handleSilenceApply(host) {
  const { edit, units } = panelContext(host);
  const source = units.length ? { words: units } : { silences: host.sidecar.silences || [] };
  const settings = { threshold: host.threshold, padding: host.padding };
  if (tighten(edit, settings, source))
    Object.assign(host, { silence: false, anchor: -1, head: -1 });
}
