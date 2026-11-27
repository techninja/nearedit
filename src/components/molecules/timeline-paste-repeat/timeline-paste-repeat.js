/**
 * Paste repeat — the small dialog behind Ctrl+B: how many copies of the
 * clipboard to paste from the cursor on, and whether they sit end to end or
 * start a fixed time apart. Dispatches `apply` (detail: `{ count, every }`,
 * `every` in seconds, 0 = end to end) and `close`.
 * @module components/molecules/timeline-paste-repeat
 */

import { html, define, dispatch } from 'hybrids';
import { MAX_REPEATS } from '#utils/edl/selectionEdits.js';

/**
 * @typedef {Object} TimelinePasteRepeatHost
 * @property {boolean} open
 * @property {number} count - Copies to paste
 * @property {boolean} spaced - Paste at a fixed interval instead of end to end
 * @property {number} every - The interval, seconds
 */

/** @typedef {TimelinePasteRepeatHost & HTMLElement} Host */

/** @param {Host} host */
function close(host) {
  dispatch(host, 'close', { bubbles: true });
}

/**
 * @param {Host} host
 * @param {Event} event
 */
function handleSubmit(host, event) {
  event.preventDefault();
  const count = Math.max(1, Math.min(MAX_REPEATS, Math.round(host.count) || 1));
  const detail = { count, every: host.spaced ? Math.max(0, host.every) : 0 };
  dispatch(host, 'apply', { detail, bubbles: true });
  close(host);
}

/**
 * A field changed: the input names the property in `data-field`.
 * @param {Host} host
 * @param {Event} event
 */
function handleField(host, event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  if (input.dataset.field === 'spaced') host.spaced = input.value === 'spaced';
  else host[input.dataset.field] = Number(input.value) || 0;
}

/**
 * @param {Host} host
 * @param {KeyboardEvent} event
 */
function handleKey(host, event) {
  if (event.key === 'Escape') close(host);
}

/**
 * @param {Host} host
 * @param {MouseEvent} event
 */
function handleBackdrop(host, event) {
  if (event.target === event.currentTarget) close(host);
}

/** @param {Host} host */
function focusFirst(host) {
  const input = host.querySelector('input');
  if (input && !host.contains(document.activeElement)) input.select();
}

/** @type {import('hybrids').Component<TimelinePasteRepeatHost>} */
export default define({
  tag: 'timeline-paste-repeat',
  open: false,
  count: 2,
  spaced: false,
  every: 1,
  render: {
    value: ({ open, count, spaced, every }) =>
      open
        ? html`
            <div class="dialog-backdrop" onclick="${handleBackdrop}">
              <form
                class="dialog timeline-paste-repeat"
                role="dialog"
                aria-modal="true"
                aria-label="Paste repeat"
                onsubmit="${handleSubmit}"
                onkeydown="${handleKey}"
                oninput="${handleField}"
              >
                <div class="dialog-header"><span>Paste repeat</span></div>
                <div class="dialog-body">
                  <label class="field-row">
                    <span class="field-label">Copies</span>
                    <input
                      class="field-input field-num"
                      type="number"
                      min="1"
                      max="${MAX_REPEATS}"
                      step="1"
                      data-field="count"
                      value="${count}"
                    />
                  </label>
                  <label class="timeline-paste-repeat-choice">
                    <input
                      type="radio"
                      name="spacing"
                      data-field="spaced"
                      value="end"
                      checked="${!spaced}"
                    />
                    End to end
                  </label>
                  <label class="timeline-paste-repeat-choice">
                    <input
                      type="radio"
                      name="spacing"
                      data-field="spaced"
                      value="spaced"
                      checked="${spaced}"
                    />
                    Even spacing: paste every
                    <input
                      class="field-input field-num"
                      type="number"
                      min="0.01"
                      step="0.01"
                      aria-label="Seconds between copies"
                      data-field="every"
                      disabled="${!spaced}"
                      value="${every}"
                    />
                    seconds
                  </label>
                </div>
                <div class="dialog-footer">
                  <button type="button" class="btn" onclick="${close}">Cancel</button>
                  <button type="submit" class="btn btn-primary">Paste</button>
                </div>
              </form>
            </div>
          `
        : html``,
    shadow: false,
    observe: focusFirst,
  },
});
