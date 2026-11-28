/**
 * What the recorder said about steps, shown with the steps in the web
 * editor: the sentence, what can be done about it, and buttons that do it —
 * go to the step, or hide what covers its target before recording. The
 * sentences come from a snapshot that could not play a step, from a
 * recording that failed, and — with `onMissing: skip` — from the warnings
 * of a snapshot or of a finished recording.
 * @module utils/webUi/editorNotices
 */

import { html } from 'hybrids';
import { selectStep, webClipOf, webEditorState } from './editorState.js';
import { setField } from './edits.js';
import { stepsSaid, withHidden } from './stepSaid.js';

/** @typedef {import('./stepSaid.js').StepSaid} StepSaid */

/** Sentences shown at once; a recording rarely has more to say. */
const MAX_NOTICES = 3;

/**
 * Everything the recorder said about the steps of the clip in the dialog.
 * @param {import('./snapshot.js').SnapshotState} snap
 * @param {import('./clipStatus.js').RecordingProgress|null} recording
 * @returns {StepSaid[]} Failures first, then warnings
 */
export function saidAbout(snap, recording) {
  const warnings = [...(recording?.warnings || []), ...(snap.snapshot?.warnings || [])];
  return stepsSaid([snap.error, recording?.message, ...warnings]);
}

/** "Go to step N". @param {any} _host @param {Event} event */
function handleGoTo(_host, event) {
  selectStep(Number(/** @type {HTMLElement} */ (event.currentTarget).dataset.step));
  webEditorState.set({ tab: 'steps', mode: 'page' });
}

/** "Hide … before recording": add what covers the target to the recipe's `hide`. @param {any} _host @param {Event} event */
function handleHide(_host, event) {
  const { target } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  const { clipId } = webEditorState.get();
  const found = webClipOf(clipId);
  if (found) setField(clipId, 'hide', withHidden(found.clip.web.recipe.hide, target));
}

/**
 * @param {StepSaid[]} said
 * @param {import('#utils/web/types.js').Recipe} recipe
 * @param {boolean} locked
 * @returns {import('hybrids').UpdateFunctionWithMethods<any>} Nothing when nothing was said
 */
export function notices(said, recipe, locked) {
  const shown = said.filter((one) => one.index < recipe.steps.length).slice(0, MAX_NOTICES);
  if (!shown.length) return html``;
  return html`<div class="web-editor-said">
    ${shown.map(
      (one) =>
        html`<div class="app-callout app-callout-error" role="alert" data-step="${one.index}">
          <app-icon name="alert" size="sm"></app-icon>
          <div class="app-callout-body">
            <strong>${one.text}</strong>
            <span>${one.advice}</span>
            <span class="toolbar-group">
              <button
                type="button"
                class="btn btn-secondary"
                data-step="${one.index}"
                onclick="${handleGoTo}"
              >
                Go to step ${one.index + 1}
              </button>
              ${one.cover && !recipe.hide.includes(one.cover)
                ? html`<button
                    type="button"
                    class="btn btn-secondary"
                    data-target="${one.cover}"
                    title="Adds it to what is removed from the page before recording"
                    disabled="${locked}"
                    onclick="${handleHide}"
                  >
                    Hide ${one.cover}
                  </button>`
                : html``}
            </span>
          </div>
        </div>`,
    )}
  </div>`;
}
