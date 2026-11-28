/**
 * Web section of the Create tab — an address, a page size and "Add web
 * clip". Says, in the server's own words, when this server cannot record
 * yet and what to do about it; a clip can be added and scripted all the
 * same. Remembers the addresses used last in the project. Asks to add with
 * a bubbling `web-add` event (`detail: { address, sizeId }`).
 * @module components/molecules/web-create
 */

import { define, dispatch, html, store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { watch } from '#utils/ui/observable.js';
import { readAddress, recentAddresses } from '#utils/webUi/address.js';
import { captureState, loadCaptureStatus } from '#utils/webUi/captureStatus.js';
import { captureNote, recentList } from '#utils/webUi/createParts.js';
import { DEFAULT_SIZE, WEB_SIZES, sizeText } from '#utils/webUi/sizes.js';
import '#atoms/app-icon/app-icon.js';

/**
 * @typedef {Object} WebCreateHost
 * @property {string} address - What is typed
 * @property {string} sizeId
 * @property {string} problem - Why the address cannot be used
 * @property {number} added - Clips added so far (re-reads the recent addresses)
 * @property {import('#utils/webUi/captureStatus.js').CaptureState} capture
 * @property {import('#store/ProjectState.js').ProjectStateShape} project
 */

/** @typedef {WebCreateHost & HTMLElement} Host */

/** @param {Host} host */
function add(host) {
  const { url, problem } = readAddress(host.address);
  host.problem = problem;
  if (!url) return;
  dispatch(host, 'web-add', { detail: { address: url, sizeId: host.sizeId }, bubbles: true });
  host.address = '';
  host.added += 1;
}

/** @param {Host} host @param {Event} event */
function handleInput(host, event) {
  host.address = /** @type {HTMLInputElement} */ (event.target).value;
  host.problem = '';
}

/** Enter adds; no key typed here reaches the editor's shortcuts. @param {Host} host @param {KeyboardEvent} event */
function handleKeys(host, event) {
  event.stopPropagation();
  if (event.key === 'Enter') add(host);
}

/** @param {Host} host @param {Event} event */
function handleSize(host, event) {
  host.sizeId = /** @type {HTMLElement} */ (event.currentTarget).dataset.size;
}

/** A recent address was pressed: it goes into the box. @param {Host} host @param {Event} event */
function handleRecent(host, event) {
  host.address = /** @type {HTMLElement} */ (event.currentTarget).dataset.url;
  host.problem = '';
}

/** @type {import('hybrids').Component<WebCreateHost>} */
export default define({
  tag: 'web-create',
  address: '',
  sizeId: DEFAULT_SIZE,
  problem: '',
  added: 0,
  capture: {
    ...watch(captureState),
    connect: (host, key, invalidate) => {
      loadCaptureStatus();
      return watch(captureState).connect(host, key, invalidate);
    },
  },
  project: store(ProjectState),
  render: {
    value: ({ address, sizeId, problem, capture, project, added }) => {
      const recent = added >= 0 ? recentAddresses(project.projectId) : [];
      return html`
        <div class="field-group-title">Web page</div>
        <p class="web-create-about">
          Footage of a web page being used. Give its address, then script what happens — clicks,
          typing, scrolling — and record it. Every pause and path can be changed afterwards.
        </p>
        ${captureNote(capture)}
        <label class="web-create-address">
          <span class="field-label">Address</span>
          <input
            class="field-input"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="example.com"
            aria-invalid="${problem ? 'true' : 'false'}"
            value="${address}"
            oninput="${handleInput}"
            onkeydown="${handleKeys}"
          />
        </label>
        ${problem && html`<p class="error-message web-create-problem" role="alert">${problem}</p>`}
        <div class="web-create-sizes" role="group" aria-label="Page size">
          ${WEB_SIZES.map(
            (size) =>
              html`<button
                type="button"
                class="web-create-size"
                data-size="${size.id}"
                aria-pressed="${size.id === sizeId ? 'true' : 'false'}"
                onclick="${handleSize}"
              >
                <app-icon name="${size.icon}" size="sm"></app-icon>
                <span>${size.label}</span>
                <small>${sizeText(size)}</small>
              </button>`,
          )}
        </div>
        <button type="button" class="btn btn-primary web-create-add" onclick="${add}">
          <app-icon name="web" size="sm"></app-icon> Add web clip
        </button>
        ${recentList(recent, handleRecent)}
      `;
    },
    shadow: false,
  },
});
