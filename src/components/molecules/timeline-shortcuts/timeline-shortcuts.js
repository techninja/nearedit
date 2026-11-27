/**
 * Shortcuts list — a dialog of every editor command with its current
 * keyboard shortcut (generated from the command registry and the keymap,
 * so the chosen preset and remapped keys show up) and the mouse and touch
 * gestures of the timeline. Its head switches between the NearEdit and
 * Vegas layouts and wheel modes, and warns about remapped keys that
 * collide. Dispatches `close`.
 * @module components/molecules/timeline-shortcuts
 */

import { html, define, dispatch, store } from 'hybrids';
import UserPrefs from '#store/UserPrefs.js';
import { commandGroups } from '#utils/commands/registry.js';
import { overrideConflicts, shortcutLabels, suspendKeyboard } from '#utils/keyboard/index.js';
import { pointerGestures } from '#utils/timeline/gestureList.js';
import '#atoms/app-icon/app-icon.js';
import '#molecules/timeline-shortcut-prefs/timeline-shortcut-prefs.js';

/**
 * @typedef {Object} TimelineShortcutsHost
 * @property {boolean} open
 * @property {import('#store/UserPrefs.js').UserPrefsShape} prefs - Preset and wheel mode
 */

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
 * @param {boolean} [clash] - A remapped key of this command collides with another
 */
function row(label, keys, clash = false) {
  return html`
    <div class="${{ 'timeline-shortcuts-row': true, clash }}">
      <span>${label}</span>
      <span class="timeline-shortcuts-keys">
        ${clash && html`<span class="badge badge-warning" title="A remapped key collides">!</span>`}
        ${keys.map((key) => html`<kbd class="kbd">${key}</kbd>`)}
      </span>
    </div>
  `;
}

/**
 * The list itself: every command under its heading, then the pointer.
 * @param {import('#store/UserPrefs.js').UserPrefsShape} prefs
 */
function list(prefs) {
  const clashing = new Set(overrideConflicts().flatMap((c) => [c.commandId, ...c.others]));
  return html`
    ${commandGroups().map(
      ({ group, commands }) => html`
        <h3 class="field-group-title">${group}</h3>
        ${commands.map((command) =>
          row(command.label, shortcutLabels(command.id), clashing.has(command.id)),
        )}
      `,
    )}
    <h3 class="field-group-title">Mouse and touch</h3>
    ${pointerGestures(prefs.wheelMode).map(([label, gesture]) => row(label, [gesture]))}
  `;
}

/** @type {import('hybrids').Component<TimelineShortcutsHost>} */
export default define({
  tag: 'timeline-shortcuts',
  open: false,
  prefs: store(UserPrefs),
  render: {
    // Reading `prefs` redraws the list when the preset or the wheel mode changes.
    value: ({ open, prefs }) =>
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
                <timeline-shortcut-prefs></timeline-shortcut-prefs>
                <div class="dialog-body" data-preset="${prefs.keymapPreset}">${list(prefs)}</div>
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
