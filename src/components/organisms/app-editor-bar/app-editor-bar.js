/**
 * Editor bar organism — the editor's slim header: the way back to the
 * project, what is open (with its aspect ratio), whether it is saved,
 * undo and redo, the theme, the job tray and Export.
 * Reads `ProjectState` and `#utils/ui/editorPage.js`.
 * @module components/organisms/app-editor-bar
 */

import { html, define, store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { saveNow } from '#utils/editor/project.js';
import { redo, undo } from '#utils/editor/session.js';
import { editorPageState, setExportOpen } from '#utils/ui/editorPage.js';
import { watch } from '#utils/ui/observable.js';
import { HOME_URL, projectUrl } from '#utils/ui/routes.js';
import { saveIndicator } from '#utils/ui/saveState.js';
import '#atoms/app-icon/index.js';
import '#atoms/theme-toggle/index.js';
import '#organisms/job-tray/index.js';

/**
 * @typedef {Object} AppEditorBarHost
 * @property {import('#store/ProjectState.js').ProjectStateShape} project
 * @property {import('#utils/ui/editorPage.js').EditorPageState} page
 */

const SAVE_ICONS = { saved: 'check', saving: 'loader', error: 'alert' };

/** Open the export dialog. */
function handleExport() {
  setExportOpen(true);
}

/**
 * @param {import('#utils/ui/saveState.js').SaveIndicator} save
 * @returns {import('hybrids').UpdateFunctionWithMethods<AppEditorBarHost>}
 */
function saveTemplate(save) {
  if (save.kind === 'none') return html``;
  if (save.kind === 'error')
    return html`
      <button
        type="button"
        class="app-editor-bar-save app-editor-bar-save-error"
        title="${save.detail}"
        onclick="${saveNow}"
      >
        <app-icon name="alert" size="sm"></app-icon>
        <span>${save.label}</span>
        <span class="app-editor-bar-retry">Retry</span>
      </button>
    `;
  return html`
    <span
      class="app-editor-bar-save app-editor-bar-save-${save.kind}"
      role="status"
      title="${save.detail}"
    >
      ${save.kind === 'saving'
        ? html`<span class="spinner"></span>`
        : html`<app-icon name="${SAVE_ICONS[save.kind]}" size="sm"></app-icon>`}
      <span>${save.label}</span>
    </span>
  `;
}

/** @type {import('hybrids').Component<AppEditorBarHost>} */
export default define({
  tag: 'app-editor-bar',
  project: store(ProjectState),
  page: watch(editorPageState),
  render: {
    value: ({ project, page }) => {
      const back = project.projectId ? projectUrl(project.projectId) : HOME_URL;
      const ready = page.status === 'ready';
      return html`
        <header class="app-editor-bar">
          <a
            class="icon-btn"
            href="${back}"
            aria-label="Back to the project"
            title="Back to the project"
          >
            <app-icon name="chevron-left" size="sm"></app-icon>
          </a>
          <div class="app-editor-bar-names">
            <a class="app-editor-bar-project" href="${back}">${project.projectName}</a>
            ${project.projectName ? html`<span class="app-editor-bar-sep">/</span>` : html``}
            <strong class="app-editor-bar-adaptation">${project.adaptationName}</strong>
            ${ready
              ? html`<span class="chip app-editor-bar-aspect">${project.aspectRatio}</span>`
              : html``}
          </div>
          ${saveTemplate(saveIndicator(project))}
          <span class="toolbar-spacer"></span>
          <div class="toolbar-group">
            <button
              type="button"
              class="icon-btn"
              aria-label="Undo"
              title="Undo (Ctrl/⌘+Z)"
              disabled="${!page.canUndo}"
              onclick="${undo}"
            >
              <app-icon name="undo" size="sm"></app-icon>
            </button>
            <button
              type="button"
              class="icon-btn"
              aria-label="Redo"
              title="Redo (Ctrl/⌘+Shift+Z)"
              disabled="${!page.canRedo}"
              onclick="${redo}"
            >
              <app-icon name="redo" size="sm"></app-icon>
            </button>
          </div>
          <theme-toggle></theme-toggle>
          <job-tray></job-tray>
          <button
            type="button"
            class="btn btn-primary app-editor-bar-export"
            title="Export a video file"
            disabled="${!ready}"
            onclick="${handleExport}"
          >
            <app-icon name="export" size="sm"></app-icon>
            <span>Export</span>
          </button>
        </header>
      `;
    },
    shadow: false,
  },
});
