/**
 * Confirm host molecule — shows the question asked with `confirmAction`
 * (`#utils/ui/confirm.js`) as a small dialog. Mounted once, by the router.
 * @module components/molecules/app-confirm-host
 */

import { html, define } from 'hybrids';
import { answerConfirm, confirmState } from '#utils/ui/confirm.js';
import { dialogFrame } from '#utils/ui/dialogFrame.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-dialog/index.js';

/**
 * @typedef {Object} AppConfirmHostHost
 * @property {{ request: import('#utils/ui/confirm.js').ConfirmRequest|null }} state
 */

/** Dismissing the dialog (Escape, backdrop, ×) answers "no". */
function handleCancel() {
  answerConfirm(false);
}

/** The confirm button answers "yes". */
function handleConfirm() {
  answerConfirm(true);
}

/**
 * @param {import('#utils/ui/confirm.js').ConfirmRequest} request
 * @returns {import('hybrids').UpdateFunctionWithMethods<AppConfirmHostHost>}
 */
function question(request) {
  // A destructive question starts on Cancel, so a stray Enter cannot destroy.
  const footer = html`
    <button
      type="button"
      class="btn btn-secondary"
      data-autofocus="${request.danger ? '' : false}"
      onclick="${handleCancel}"
    >
      ${request.cancelLabel}
    </button>
    <button
      type="button"
      class="btn ${request.danger ? 'btn-danger' : 'btn-primary'} app-confirm-yes"
      data-autofocus="${request.danger ? false : ''}"
      onclick="${handleConfirm}"
    >
      ${request.confirmLabel}
    </button>
  `;
  const body = html`<p class="app-confirm-message">${request.message}</p>`;
  return dialogFrame({ title: request.title, body, footer, size: 'small', onClose: handleCancel });
}

/** @type {import('hybrids').Component<AppConfirmHostHost>} */
export default define({
  tag: 'app-confirm-host',
  state: watch(confirmState),
  render: {
    value: ({ state }) =>
      state.request
        ? html`<app-dialog open onclose="${handleCancel}">${question(state.request)}</app-dialog>`
        : html``,
    shadow: false,
  },
});
