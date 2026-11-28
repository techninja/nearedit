/**
 * The inside of the web editor dialog (`<web-editor>`) as templates: the
 * top bar, the page view (the page map with its element list, or the
 * recording playing), the steps with the selected step's form, and the
 * score strip. On a narrow screen the three parts are tabs.
 * @module utils/webUi/editorParts
 */

import { html } from 'hybrids';
import { canRedo, canUndo } from '#utils/editor/session.js';
import { stepKind } from '#utils/web/index.js';
import * as on from './editorEvents.js';
import { notices, saidAbout } from './editorNotices.js';
import { pageArea } from './editorPage.js';
import { settingsForm } from './editorSettings.js';
import * as view from './editorView.js';
import { stripBlocks } from './scoreStrip.js';
import { recipeProblems, stepFields } from './stepForm.js';
import { saidByStep } from './stepSaid.js';
import { stepRows } from './stepRows.js';

/** @typedef {import('./editorView.js').WebEditorHost} WebEditorHost */
/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/** @typedef {import('./editorPage.js').EditorFacts} EditorFacts */

/**
 * What is wrong with each step: what `validateRecipe` finds, and — under
 * the field the step aims with — what the recorder said when it played it.
 * @param {import('#utils/web/types.js').Recipe} recipe
 * @param {Record<number, Record<string, string>>} said - `saidByStep`
 * @returns {Record<number, Record<string, string>>} By step, then by field
 */
function stepProblems(recipe, said) {
  const { steps } = recipeProblems(recipe);
  for (const [index, { recorder }] of Object.entries(said)) {
    const params = stepKind(recipe.steps[index]?.do)?.params || {};
    const aim = ['target', 'to'].find((name) => name in params) || 'recorder';
    steps[index] = { [aim]: recorder, ...steps[index] };
  }
  return steps;
}

/**
 * Everything between the dialog's header and its footer.
 * @param {WebEditorHost} host
 * @param {EditorFacts} facts
 * @returns {Template}
 */
export function editorBody(host, facts) {
  const { state, snap, playhead } = host;
  const { recipe, selected, locked, fps, clip } = facts;
  const said = saidAbout(snap, facts.recording, recipe, fps);
  const problems = stepProblems(recipe, saidByStep(said));
  const { rows } = stepRows(recipe, fps, problems);
  const step = recipe.steps[selected];
  const kind = stepKind(step?.do);
  return html`
    <app-tabs
      class="web-editor-tabs"
      tabs="${view.TABS}"
      active="${state.tab}"
      label="Parts of the web editor"
      ontabchange="${view.handleTab}"
    ></app-tabs>
    <div class="web-editor-top">
      <web-topbar recipe="${recipe}" busy="${snap.busy}" locked="${locked}"></web-topbar>
      <button
        type="button"
        class="icon-btn"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        disabled="${!canUndo()}"
        onclick="${on.handleUndo}"
      >
        <app-icon name="undo" size="sm"></app-icon>
      </button>
      <button
        type="button"
        class="icon-btn"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        disabled="${!canRedo()}"
        onclick="${on.handleRedo}"
      >
        <app-icon name="redo" size="sm"></app-icon>
      </button>
    </div>
    <section class="web-editor-page" aria-label="Page">${pageArea(host, facts)}</section>
    <section class="web-editor-steps" aria-label="Steps">
      ${notices(said, recipe, locked)}
      <web-step-list rows="${rows}" selected="${selected}" locked="${locked}"></web-step-list>
      <div class="web-editor-form">
        ${step && kind
          ? html`<web-step-form
              fields="${stepFields(step, problems[selected])}"
              index="${selected}"
              heading="${kind.label}"
              about="${kind.description}"
              picking="${state.picking}"
              locked="${locked}"
            ></web-step-form>`.key(`${selected}:${step.do}`)
          : settingsForm(recipe, locked)}
      </div>
    </section>
    <section class="web-editor-timing" aria-label="Timing">
      <web-score-strip
        strip="${stripBlocks(recipe, fps)}"
        selected="${selected < recipe.steps.length ? selected : -1}"
        playhead="${state.mode === 'recording' ? playhead : -1}"
        scrub="${Boolean(clip.sourceFile)}"
        locked="${locked}"
      ></web-score-strip>
    </section>
  `;
}
