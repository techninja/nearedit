/**
 * Parts of the transcript panel's template: the paragraphs, the footer
 * (what is shown, where it plays, the preview player for files that are
 * not on the timeline) and the keyboard handler of the text.
 * @module utils/transcript/panelParts
 */

import { html } from 'hybrids';
import { formatClock } from '#utils/media/format.js';
import { mediaFileUrl } from '#utils/playback/mediaUrl.js';
import { runAction } from './panelCommands.js';
import { hitsIn } from './panelContext.js';
import { textKeyAction } from './panelPointer.js';
import { unitAt } from './units.js';
import { OFF } from './usage.js';

/** @typedef {import('./panelContext.js').Host} Host */

/**
 * A handler that resets one of the host's index properties to "none".
 * @param {'editing'|'match'} key
 * @returns {(host: Host) => void}
 */
export function hide(key) {
  return (host) => {
    host[key] = -1;
  };
}

/** @param {Host} host @param {KeyboardEvent} event - Keys on the transcript text */
export function handleTextKeys(host, event) {
  if (/** @type {HTMLElement} */ (event.target).matches('input')) return;
  const action = textKeyAction(host, event);
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  if (action !== 'handled') runAction(host, action);
}

/** @param {Host} host @param {Event} event - The preview player moved */
function handlePreviewTime(host, event) {
  const { units } = /** @type {any} */ (host).querySelector('transcript-paragraph') || {
    units: [],
  };
  const current = unitAt(units, /** @type {HTMLMediaElement} */ (event.target).currentTime + 0.03);
  if (current !== host.current) host.current = current;
}

/**
 * The line under the transcript.
 * @param {import('./panelContext.js').TranscriptPanelHost} host
 * @param {ReturnType<typeof import('./panelContext.js').panelContext>} ctx
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>}
 */
export function footer(host, ctx) {
  const { units, chain, states, level, onTimeline } = ctx;
  if (!units.length) return html``;
  const cut = onTimeline ? states.filter((state) => state === OFF).length : 0;
  const pieces = chain.segments.length;
  const facts = [
    host.file.split(/[\\/]/).pop(),
    `${units.length} ${level === 'segment' ? 'phrases' : 'words'}`,
    onTimeline && `${pieces} ${pieces === 1 ? 'clip' : 'clips'} on the timeline`,
    cut > 0 && `${cut} not in the edit`,
    chain.locked && 'track locked',
  ].filter(Boolean);
  return html`<footer class="transcript-panel-footer">
    <span class="transcript-panel-facts">${facts.join(' · ')}</span>
    ${host.message &&
    html`<span class="transcript-panel-message" role="status">${host.message}</span>`}
    ${!onTimeline &&
    html`<span class="transcript-panel-preview">
      Not on the timeline — words move this preview
      <audio
        controls
        preload="metadata"
        src="${mediaFileUrl(host.file)}"
        ontimeupdate="${handlePreviewTime}"
      ></audio>
    </span>`}
  </footer>`;
}

/**
 * The paragraphs of the transcript.
 * @param {import('./panelContext.js').TranscriptPanelHost} host
 * @param {ReturnType<typeof import('./panelContext.js').panelContext>} ctx
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>[]}
 */
export function paragraphs(host, ctx) {
  const { units, states, range, matches, chain } = ctx;
  const active = matches[host.match];
  const inside = (/** @type {number} */ i, /** @type {any} */ p) =>
    i >= p.first && i <= p.last ? i : -1;
  // A paragraph is told about the selection only when it holds part of it.
  const sel = (/** @type {any} */ p) =>
    range && range.last >= p.first && range.first <= p.last ? range : { first: -1, last: -1 };
  return ctx.paragraphs.map((p) =>
    html`<transcript-paragraph
      units="${units}"
      first="${p.first}"
      last="${p.last}"
      states="${states}"
      plain="${!ctx.onTimeline}"
      tint="${chain.segments.length > 1}"
      selfrom="${sel(p).first}"
      selto="${sel(p).last}"
      current="${inside(host.current, p)}"
      hits="${hitsIn(matches, p)}"
      activehit="${active && hitsIn([active], p)}"
      editing="${inside(host.editing, p)}"
      stamp="${formatClock(p.start)}"
    ></transcript-paragraph>`.key(p.first),
  );
}
