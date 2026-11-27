/**
 * Go-to field — type a time and the cursor goes there (Vegas: Ctrl+G).
 * Shown while `open`; Enter goes, Escape or leaving the field gives up, and
 * either way it dispatches `done`. Understands timecode (`1:02:03:04`),
 * bare digits filled from the right (`1000` = ten seconds), decimal
 * seconds (`12.5`) and relative moves (`+2:00`, `-15`).
 * @module components/molecules/timeline-goto
 */

import { html, define, dispatch } from 'hybrids';
import { goToTypedTime } from '#utils/commands/navigate.js';
import { getDoc } from '#utils/editor/session.js';
import { formatTimecode } from '#utils/playback/timecode.js';
import { getPosition } from '#utils/playback/transport.js';

/**
 * @typedef {Object} TimelineGotoHost
 * @property {boolean} open
 * @property {boolean} invalid - The last entry could not be read as a time
 */

/** @typedef {TimelineGotoHost & HTMLElement} Host */

/** @param {Host} host */
function finish(host) {
  if (!host.open) return;
  host.invalid = false;
  dispatch(host, 'done', { bubbles: true });
}

/**
 * Enter goes to the typed time (and stays open on a typo); Escape gives up.
 * @param {Host} host
 * @param {KeyboardEvent} event
 */
function handleKey(host, event) {
  if (event.key === 'Escape') return finish(host);
  if (event.key !== 'Enter') return undefined;
  const input = /** @type {HTMLInputElement} */ (event.target);
  host.invalid = !goToTypedTime(input.value);
  if (!host.invalid) finish(host);
  return undefined;
}

/**
 * Put the caret in a field that just appeared, with its text selected.
 * @param {Host} host
 */
function focusField(host) {
  const input = host.querySelector('input');
  if (input && document.activeElement !== input) input.select();
}

/** @type {import('hybrids').Component<TimelineGotoHost>} */
export default define({
  tag: 'timeline-goto',
  open: false,
  invalid: false,
  render: {
    value: ({ open, invalid }) =>
      open
        ? html`
            <input
              class="field-input timeline-goto"
              aria-label="Go to time"
              aria-invalid="${String(invalid)}"
              title="Timecode, seconds (12.5), or +/- to move from here"
              spellcheck="false"
              value="${formatTimecode(getPosition(), getDoc().fps)}"
              onkeydown="${handleKey}"
              onblur="${finish}"
            />
          `
        : html``,
    shadow: false,
    observe: focusField,
  },
});
