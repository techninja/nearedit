/**
 * Shortcuts list — a dialog of every editor command with its current
 * keyboard shortcut (generated from the command registry and the keymap,
 * so remapped keys show up) and the mouse and touch gestures of the
 * timeline. Dispatches `close`.
 * @module components/molecules/timeline-shortcuts
 */

import { html, define, dispatch } from 'hybrids';
import { commandGroups } from '#utils/commands/registry.js';
import { shortcutLabels, suspendKeyboard } from '#utils/keyboard/index.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} TimelineShortcutsHost
 * @property {boolean} open
 */

/** Pointer gestures, which no keymap describes. */
const GESTURES = [
  ['Move a clip (onto another to cross-fade)', 'Drag'],
  ['Trim', 'Drag an edge'],
  ['Slip the source under a clip', 'Alt + drag'],
  ['Fade in / out', 'Drag a top corner'],
  ['Select several', 'Ctrl / Shift + click, or drag a box'],
  ['Move the playhead', 'Click or drag the ruler'],
  ['Set the loop region', 'Shift + drag the ruler'],
  ['Rename a marker', 'Double-click it'],
  ['Zoom about the pointer', 'Ctrl + wheel, or pinch'],
  ['Pan', 'Space + drag, or middle button'],
  ['Ignore snapping for one drag', 'Hold Shift'],
  ['Context menu', 'Right-click, or long-press'],
];

/** @type {WeakMap<HTMLElement, () => void>} Resumes the shortcut handler when the dialog closes */
const resumes = new WeakMap();

/** @param {TimelineShortcutsHost & HTMLElement} host */
function close(host) {
  dispatch(host, 'close', { bubbles: true });
}

/**
 * @param {TimelineShortcutsHost & HTMLElement} host
 * @param {MouseEvent} event
 */
function handleBackdrop(host, event) {
  if (event.target === event.currentTarget) close(host);
}

/**
 * @param {TimelineShortcutsHost & HTMLElement} host
 * @param {KeyboardEvent} event
 */
function handleKey(host, event) {
  if (event.key === 'Escape') close(host);
}

/**
 * While the dialog is open the editor's shortcuts are paused and the
 * dialog has the focus.
 * @param {TimelineShortcutsHost & HTMLElement} host
 */
function syncFocus(host) {
  if (host.open === resumes.has(host)) return;
  if (!host.open) {
    resumes.get(host)();
    resumes.delete(host);
    return;
  }
  resumes.set(host, suspendKeyboard());
  /** @type {HTMLElement|null} */ (host.querySelector('.dialog'))?.focus();
}

/**
 * @param {string} label
 * @param {string[]} keys
 */
function row(label, keys) {
  return html`
    <div class="timeline-shortcuts-row">
      <span>${label}</span>
      <span class="timeline-shortcuts-keys">
        ${keys.map((key) => html`<kbd class="kbd">${key}</kbd>`)}
      </span>
    </div>
  `;
}

/** @type {import('hybrids').Component<TimelineShortcutsHost>} */
export default define({
  tag: 'timeline-shortcuts',
  open: false,
  render: {
    value: ({ open }) =>
      open
        ? html`
            <div class="dialog-backdrop" onclick="${handleBackdrop}">
              <div
                class="dialog timeline-shortcuts"
                role="dialog"
                aria-modal="true"
                aria-label="Keyboard shortcuts"
                tabindex="-1"
                onkeydown="${handleKey}"
              >
                <div class="dialog-header">
                  <app-icon name="keyboard" size="sm"></app-icon>
                  <span>Keyboard shortcuts</span>
                  <span class="toolbar-spacer"></span>
                  <button type="button" class="icon-btn" aria-label="Close" onclick="${close}">
                    <app-icon name="x" size="sm"></app-icon>
                  </button>
                </div>
                <div class="dialog-body">
                  ${commandGroups().map(
                    ({ group, commands }) => html`
                      <h3 class="field-group-title">${group}</h3>
                      ${commands.map((command) => row(command.label, shortcutLabels(command.id)))}
                    `,
                  )}
                  <h3 class="field-group-title">Mouse and touch</h3>
                  ${GESTURES.map(([label, gesture]) => row(label, [gesture]))}
                </div>
              </div>
            </div>
          `
        : html``,
    shadow: false,
    connect: (host) => () => {
      resumes.get(host)?.();
      resumes.delete(host);
    },
    observe: syncFocus,
  },
});
