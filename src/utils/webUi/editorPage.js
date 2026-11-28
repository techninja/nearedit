/**
 * The page area of the web editor: a line saying what is shown, then the
 * page map (with its element list) or the recording playing.
 * @module utils/webUi/editorPage
 */

import { html } from 'hybrids';
import { mediaFileUrl } from '#utils/playback/mediaUrl.js';
import { describeTarget } from '#utils/web/index.js';
import * as view from './editorView.js';

/** @typedef {import('./editorView.js').WebEditorHost} WebEditorHost */
/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/**
 * What the selected step aims at, as text, for the page map to mark.
 * @param {Record<string, any>|undefined} step
 * @returns {string} '' for a step that aims at nothing, or at a position in pixels
 */
function markText(step) {
  const target = step?.target || step?.to;
  return typeof target === 'number' ? '' : describeTarget(target);
}

/**
 * @typedef {Object} EditorFacts - What a render of the dialog works from
 * @property {any} clip
 * @property {boolean} locked
 * @property {import('#utils/web/types.js').Recipe} recipe
 * @property {number} selected - Inside `0 … steps.length`
 * @property {number} fps
 * @property {{ state: string, text: string, action: string }} status
 */

/**
 * The page view: what it shows, and the picture or the recording.
 * @param {WebEditorHost} host
 * @param {EditorFacts} facts
 * @returns {Template}
 */
export function pageArea({ state, snap, listOpen, seek }, { clip, recipe, selected, status }) {
  const playing = state.mode === 'recording' && Boolean(clip.sourceFile);
  const step = recipe.steps[selected];
  const count = snap.snapshot?.elements?.length || 0;
  const caption = state.picking
    ? `Press what step ${selected + 1} should aim at`
    : snap.snapshot?.title || snap.snapshot?.url || '';
  /** @type {(mode: string, label: string, disabled: boolean) => Template} */
  const mode = (id, label, disabled) =>
    html`<button
      type="button"
      data-mode="${id}"
      aria-pressed="${(playing ? 'recording' : 'page') === id ? 'true' : 'false'}"
      disabled="${disabled}"
      onclick="${view.handleMode}"
    >
      ${label}
    </button>`;
  return html`
    <div class="web-editor-page-bar">
      <div class="seg" role="group" aria-label="What the view shows">
        ${mode(
          'page',
          selected < recipe.steps.length ? `Before step ${selected + 1}` : 'Page',
          false,
        )}
        ${mode('recording', 'Recording', !clip.sourceFile)}
      </div>
      <span class="web-editor-caption app-muted">${playing ? '' : caption}</span>
      <button
        type="button"
        class="icon-btn"
        aria-pressed="${listOpen ? 'true' : 'false'}"
        title="List everything on the page a step can aim at"
        disabled="${playing || !snap.snapshot}"
        onclick="${view.handleListToggle}"
      >
        <app-icon name="list" size="sm"></app-icon> Elements${count ? ` (${count})` : ''}
      </button>
    </div>
    ${!playing && snap.error
      ? html`<div class="app-callout app-callout-error web-editor-error" role="alert">
          <app-icon name="alert" size="sm"></app-icon>
          <div class="app-callout-body">
            <strong>The page cannot be shown here</strong><span>${snap.error}</span>
          </div>
        </div>`
      : html``}
    <div class="web-editor-view">
      ${playing
        ? html`<web-playback
            src="${mediaFileUrl(clip.sourceFile)}"
            seek="${seek}"
            stale="${status.state === 'stale'}"
          ></web-playback>`
        : html`<web-page-map
              snapshot="${snap.snapshot}"
              mark="${markText(step)}"
              picking="${Boolean(state.picking)}"
              busy="${snap.busy}"
            ></web-page-map>
            ${listOpen && snap.snapshot
              ? html`<web-element-list snapshot="${snap.snapshot}"></web-element-list>`
              : html``}
            ${snap.busy
              ? html`<div class="chip web-editor-busy" role="status">
                  <span class="spinner"></span>
                  ${snap.snapshot ? 'Playing the steps up to here…' : 'Loading the page…'}
                </div>`
              : html``}`}
    </div>
  `;
}
