/**
 * The inside of the music editor dialog (`<music-editor>`) as templates:
 * the top bar; the parts; the open part's pattern — a drum grid or a piano
 * roll with its "Write…" form; and its sound. On a narrow screen the three
 * are tabs.
 * @module utils/musicUi/editorParts
 */

import { html } from 'hybrids';
import { canRedo, canUndo } from '#utils/editor/session.js';
import { musicClipStatus } from './clipStatus.js';
import * as on from './editorEvents.js';
import * as view from './editorView.js';
import { retryRendering } from './rendering.js';

/** @typedef {import('./editorView.js').MusicEditorHost} MusicEditorHost */
/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/**
 * @typedef {Object} EditorFacts
 * @property {any} clip
 * @property {any} song
 * @property {any|null} part - The open part
 * @property {number[]} loop - The bars the audition repeats
 * @property {boolean} locked
 */

/** @param {string} label @param {string} icon @param {boolean} can @param {() => void} run */
const historyButton = (label, icon, can, run) =>
  html`<button
    type="button"
    class="icon-btn"
    title="${`${label} (${icon === 'undo' ? 'Ctrl+Z' : 'Ctrl+Shift+Z'})`}"
    aria-label="${label}"
    disabled="${!can}"
    onclick="${run}"
  >
    <app-icon name="${icon}" size="sm"></app-icon>
  </button>`;

/**
 * The open part's pattern: a drum grid, or a piano roll.
 * @param {MusicEditorHost} host
 * @param {EditorFacts} facts
 * @returns {Template}
 */
function pattern({ state }, { song, part, locked }) {
  if (!part) {
    return html`<p class="music-editor-empty">
      This song has no parts yet. Add drums or a synth in the parts list.
    </p>`;
  }
  if (part.kind === 'drums') {
    return html`<music-drum-grid
      shown="${part}"
      beats="${song.beatsPerBar}"
      ranges="${part.play}"
      all="${state.allLanes}"
      locked="${locked}"
    ></music-drum-grid>`.key(part.id);
  }
  return html`${state.writing
      ? html`<music-write song="${song}" locked="${locked}"></music-write>`
      : html``}
    <music-piano-roll
      shown="${part}"
      song="${song}"
      ranges="${part.play}"
      selected="${state.notes}"
      grid="${state.grid}"
      snapScale="${state.snapScale}"
      writing="${state.writing}"
      locked="${locked}"
    ></music-piano-roll>`.key(part.id);
}

/**
 * Everything between the dialog's header and its footer.
 * @param {MusicEditorHost} host
 * @param {EditorFacts} facts
 * @returns {Template}
 */
export function editorBody(host, facts) {
  const { state, audition } = host;
  const { song, part, loop, locked } = facts;
  return html`
    <app-tabs
      class="music-editor-tabs"
      tabs="${view.TABS}"
      active="${state.tab}"
      label="Parts of the music editor"
      ontabchange="${view.handleTab}"
    ></app-tabs>
    <div class="music-editor-top">
      <music-topbar
        song="${song}"
        loop="${loop}"
        audition="${audition}"
        locked="${locked}"
      ></music-topbar>
      ${historyButton('Undo', 'undo', canUndo(), on.handleUndo)}
      ${historyButton('Redo', 'redo', canRedo(), on.handleRedo)}
    </div>
    <section class="music-editor-parts" aria-label="Parts">
      <music-part-list
        song="${song}"
        selected="${part?.id || ''}"
        solo="${state.solo}"
        locked="${locked}"
      ></music-part-list>
    </section>
    <section class="music-editor-grid" aria-label="Pattern">${[pattern(host, facts)]}</section>
    <section class="music-editor-sound" aria-label="Sound">
      <music-sound shown="${part || {}}" locked="${locked}"></music-sound>
    </section>
  `;
}

/**
 * The dialog's footer: where the clip's rendering stands, and Done.
 * @param {MusicEditorHost} host
 * @param {EditorFacts} facts
 * @returns {Template}
 */
export function editorFooter(host, { clip, locked }) {
  const status = musicClipStatus(clip, host.renders.byClip[clip.clipId], locked);
  const retry = () => retryRendering(clip.clipId);
  return html`<span
      class="app-dialog-note music-editor-status"
      data-state="${status.state}"
      role="status"
    >
      ${host.audition.rendering ? 'Preparing the sound… ' : ''}${status.message || status.text}
      ${status.state === 'failed'
        ? html`<button type="button" class="btn btn-ghost" onclick="${retry}">Try again</button>`
        : html``}
    </span>
    <span class="music-editor-keys">Space plays · Enter presses · Ctrl+Z undoes</span>
    <button type="button" class="btn btn-secondary" onclick="${on.handleClose}">Done</button>`;
}
