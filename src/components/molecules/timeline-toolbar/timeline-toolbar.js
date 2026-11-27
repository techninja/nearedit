/**
 * Timeline toolbar — undo / redo, cutting, clipboard, the editing-mode
 * toggles, add marker / title / track, zoom and the shortcuts list. Every
 * button is generated from the command registry and shows whether its
 * command is available (disabled) or on (pressed).
 * @module components/molecules/timeline-toolbar
 */

import { html, define, store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { onClipboardChange } from '#utils/commands/clipboard.js';
import { getCommand, isEnabled, isPressed, runCommand } from '#utils/commands/registry.js';
import { onDocChange } from '#utils/editor/session.js';
import { releasePointerFocus } from '#utils/keyboard/focus.js';
import { shortcutLabel } from '#utils/keyboard/index.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} TimelineToolbarHost
 * @property {import('#store/ViewState.js').ViewStateShape} view - Selection and modes
 * @property {number} revision - Bumped on every document change
 */

/** Buttons, by command id, in groups separated by a divider. */
export const TOOLBAR_LAYOUT = [
  ['edit.undo', 'edit.redo'],
  ['edit.split', 'edit.delete', 'edit.rippleDelete'],
  ['edit.copy', 'edit.paste', 'edit.duplicate'],
  ['mode.snapping', 'mode.ripple', 'mode.autoCrossfade'],
  ['marker.add', 'title.add', 'track.addVideo', 'track.addAudio'],
  ['view.zoomOut', 'view.zoomIn', 'view.zoomFit'],
  ['help.shortcuts'],
];

/**
 * Run the command a button stands for.
 * @param {TimelineToolbarHost & HTMLElement} _host
 * @param {MouseEvent} event
 */
function handleCommand(_host, event) {
  runCommand(/** @type {HTMLButtonElement} */ (event.currentTarget).dataset.command);
  releasePointerFocus(event);
}

/**
 * @param {string} id - Command id
 */
function renderButton(id) {
  const command = getCommand(id);
  const shortcut = shortcutLabel(id);
  const toggle = !!command.pressed;
  return html`
    <button
      type="button"
      class="icon-btn"
      data-command="${id}"
      aria-label="${command.label}"
      aria-pressed="${toggle ? String(isPressed(id)) : null}"
      title="${shortcut ? `${command.label} (${shortcut})` : command.label}"
      disabled="${!isEnabled(id)}"
      onclick="${handleCommand}"
    >
      ${id.startsWith('track.add') && html`<span aria-hidden="true">+</span>`}
      <app-icon name="${command.icon}" size="sm"></app-icon>
    </button>
  `.key(id);
}

/** @type {import('hybrids').Component<TimelineToolbarHost>} */
export default define({
  tag: 'timeline-toolbar',
  view: store(ViewState),
  revision: {
    value: 0,
    connect(host) {
      const bump = () => {
        host.revision++;
      };
      const stops = [onDocChange(bump), onClipboardChange(bump)];
      return () => stops.forEach((stop) => stop());
    },
  },
  render: {
    // Reading `view` and `revision` makes the buttons follow the selection,
    // the modes, the undo history and the clipboard.
    value: ({ view, revision }) => html`
      <div
        class="toolbar timeline-toolbar"
        role="toolbar"
        aria-label="Timeline"
        data-revision="${revision}"
        data-selected="${view.selection.length}"
      >
        ${TOOLBAR_LAYOUT.map(
          (group, index) => html`
            ${index > 0 && html`<span class="toolbar-sep"></span>`}
            <div class="toolbar-group">${group.map(renderButton)}</div>
          `,
        )}
      </div>
    `,
    shadow: false,
  },
});
