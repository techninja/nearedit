/**
 * Steps list of the web editor — every step as a row with its label, when
 * it starts and how long it takes, and a last row for the end of the
 * recording. Press or arrow to select; drag a row, or Alt+arrow, to
 * reorder; the selected row has buttons to move, copy and delete it
 * (Delete and Ctrl+D do the same); "Add a step" asks its owner for the menu
 * of step kinds. Events: `web-select`, `web-step`, `web-step-menu`
 * (`#utils/webUi/stepListEvents.js`).
 * @module components/molecules/web-step-list
 */

import { define, html } from 'hybrids';
import * as on from '#utils/webUi/stepListEvents.js';
import { clockLabel, secondsLabel } from '#utils/webUi/stepRows.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/webUi/stepListEvents.js').StepListHost} StepListHost */

/**
 * A button of the selected row.
 * @param {string} action
 * @param {string} icon
 * @param {string} label
 * @param {boolean} disabled
 */
function rowButton(action, icon, label, disabled) {
  return html`<button
    type="button"
    class="icon-btn"
    data-action="${action}"
    title="${label}"
    aria-label="${label}"
    disabled="${disabled}"
    onclick="${on.handleAction}"
  >
    <app-icon name="${icon}" size="sm"></app-icon>
  </button>`;
}

/**
 * @param {import('#utils/webUi/stepRows.js').StepRow} row
 * @param {StepListHost} host
 */
function stepRow(row, { selected, rows, locked, dropGap, dragged }) {
  const chosen = row.index === selected;
  const gap = dragged >= 0 && dropGap === row.index ? 'before' : '';
  const last = dragged >= 0 && dropGap === rows.length && row.index === rows.length - 1;
  return html`<li
    class="${{ 'web-step-list-row': true, 'has-problem': !!row.problem }}"
    role="option"
    aria-selected="${chosen ? 'true' : 'false'}"
    tabindex="${chosen ? 0 : -1}"
    data-index="${row.index}"
    data-drop="${last ? 'after' : gap}"
    draggable="${!locked}"
    title="${row.problem || row.label}"
    onclick="${on.handleSelect}"
    onkeydown="${on.handleKeys}"
    ondragstart="${on.handleDragStart}"
    ondragend="${on.handleDragEnd}"
  >
    <span class="web-step-list-number">${row.index + 1}</span>
    <span class="web-step-list-label">${row.label}</span>
    ${row.problem && html`<app-icon name="alert" size="sm"></app-icon>`}
    <span class="web-step-list-time">${clockLabel(row.start)} · ${secondsLabel(row.length)}</span>
    ${chosen && !locked
      ? html`<span class="web-step-list-actions">
          ${rowButton('up', 'up', 'Move up (Alt+↑)', row.index === 0)}
          ${rowButton('down', 'down', 'Move down (Alt+↓)', row.index === rows.length - 1)}
          ${rowButton('duplicate', 'duplicate', 'Duplicate (Ctrl+D)', false)}
          ${rowButton('remove', 'trash', 'Delete (Del)', false)}
        </span>`
      : html``}
  </li>`.key(row.index);
}

/** @type {import('hybrids').Component<StepListHost>} */
export default define({
  tag: 'web-step-list',
  rows: { value: [] },
  selected: { value: 0, observe: on.followSelection },
  locked: false,
  dropGap: -1,
  dragged: -1,
  render: {
    value: (host) => {
      const { rows, selected, locked } = host;
      const atEnd = selected >= rows.length;
      return html`
        <ol
          class="web-step-list-rows"
          role="listbox"
          aria-label="Steps"
          ondragover="${on.handleDragOver}"
          ondrop="${on.handleDrop}"
        >
          ${rows.map((row) => stepRow(row, host))}
          <li
            class="web-step-list-row web-step-list-end"
            role="option"
            aria-selected="${atEnd ? 'true' : 'false'}"
            tabindex="${atEnd ? 0 : -1}"
            data-index="${rows.length}"
            title="The page after every step: new steps are added here"
            onclick="${on.handleSelect}"
            onkeydown="${on.handleKeys}"
          >
            <span class="web-step-list-number">→</span>
            <span class="web-step-list-label"
              >${rows.length ? 'End — the page after every step' : 'The page as it loads'}</span
            >
          </li>
        </ol>
        <button
          type="button"
          class="btn btn-secondary web-step-list-add"
          aria-haspopup="menu"
          disabled="${locked}"
          onclick="${on.handleAdd}"
        >
          <app-icon name="plus" size="sm"></app-icon>
          Add a step ${atEnd ? 'at the end' : `after step ${selected + 1}`}…
        </button>
      `;
    },
    shadow: false,
  },
});
