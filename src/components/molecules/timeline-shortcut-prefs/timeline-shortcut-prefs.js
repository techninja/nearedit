/**
 * Shortcut preferences — the head of the shortcuts dialog: which keyboard
 * layout is in use (NearEdit or Vegas), what the mouse wheel does on the
 * timeline, and a warning for every key the user's own remapping
 * (`localStorage.nearedit_keymap`) took away from another command. Both
 * choices are saved with the user's preferences and apply at once.
 * @module components/molecules/timeline-shortcut-prefs
 */

import { html, define, store } from 'hybrids';
import UserPrefs, { setUserPrefs } from '#store/UserPrefs.js';
import { getCommand } from '#utils/commands/registry.js';
import { formatCombo } from '#utils/keyboard/comboFormat.js';
import { isMacPlatform } from '#utils/keyboard/focus.js';
import { overrideConflicts, setPreset } from '#utils/keyboard/index.js';
import { PRESETS, presetId } from '#utils/keyboard/presets.js';

/**
 * @typedef {Object} TimelineShortcutPrefsHost
 * @property {import('#store/UserPrefs.js').UserPrefsShape} prefs
 */

const WHEEL_MODES = [
  { id: 'scroll', label: 'Scrolls', about: 'Wheel scrolls; Ctrl + wheel zooms' },
  { id: 'vegas', label: 'Zooms (Vegas)', about: 'Wheel zooms; Shift / Ctrl + wheel scroll' },
];

/**
 * A segment was pressed: it names its choice in `data-choice`.
 * @param {TimelineShortcutPrefsHost & HTMLElement} _host
 * @param {MouseEvent} event
 */
function handlePreset(_host, event) {
  setPreset(/** @type {HTMLElement} */ (event.currentTarget).dataset.choice);
}

/**
 * @param {TimelineShortcutPrefsHost & HTMLElement} _host
 * @param {MouseEvent} event
 */
function handleWheel(_host, event) {
  const { choice } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  setUserPrefs({ wheelMode: choice === 'vegas' ? 'vegas' : 'scroll' });
}

/**
 * @param {{ id: string, label: string, about: string }[]} choices
 * @param {string} current
 * @param {string} name - Accessible name of the group
 * @param {(host: any, event: MouseEvent) => void} onPick
 */
function segments(choices, current, name, onPick) {
  return html`
    <div class="seg" role="group" aria-label="${name}">
      ${choices.map(
        (choice) => html`
          <button
            type="button"
            data-choice="${choice.id}"
            aria-pressed="${String(choice.id === current)}"
            title="${choice.about}"
            onclick="${onPick}"
          >
            ${choice.label}
          </button>
        `,
      )}
    </div>
  `;
}

/** @param {import('#utils/keyboard/keymap.js').Conflict} conflict */
function warning({ combo, commandId, others }) {
  const label = (id) => getCommand(id)?.label || id;
  return html`
    <li>
      <kbd class="kbd">${formatCombo(combo, isMacPlatform())}</kbd> is now “${label(commandId)}” —
      your remapping took it from ${others.map((id) => `“${label(id)}”`).join(', ')}.
    </li>
  `;
}

/** @type {import('hybrids').Component<TimelineShortcutPrefsHost>} */
export default define({
  tag: 'timeline-shortcut-prefs',
  prefs: store(UserPrefs),
  render: {
    value: ({ prefs }) => {
      const preset = presetId(prefs.keymapPreset);
      const conflicts = overrideConflicts();
      return html`
        <div class="timeline-shortcut-prefs" data-preset="${preset}">
          <div class="field-row">
            <span class="field-label">Layout</span>
            ${segments(PRESETS, preset, 'Keyboard layout', handlePreset)}
          </div>
          <div class="field-row">
            <span class="field-label">Mouse wheel</span>
            ${segments(WHEEL_MODES, prefs.wheelMode, 'Mouse wheel on the timeline', handleWheel)}
          </div>
          ${conflicts.length > 0 &&
          html`<ul class="timeline-shortcut-prefs-conflicts" role="alert">
            ${conflicts.map(warning)}
          </ul>`}
        </div>
      `;
    },
    shadow: false,
  },
});
