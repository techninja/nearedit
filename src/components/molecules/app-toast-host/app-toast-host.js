/**
 * Toast host molecule — shows the messages queued with `showToast`
 * (`#utils/ui/toast.js`). Mounted once, by the router.
 * @module components/molecules/app-toast-host
 */

import { html, define } from 'hybrids';
import { watch } from '#utils/ui/observable.js';
import { dismissToast, toastState } from '#utils/ui/toast.js';
import '#atoms/app-icon/index.js';

/**
 * @typedef {Object} AppToastHostHost
 * @property {{ toasts: import('#utils/ui/toast.js').Toast[] }} state
 */

const ICONS = { info: 'info', success: 'success', error: 'alert' };

/**
 * @param {import('#utils/ui/toast.js').Toast} toast
 * @param {import('#utils/ui/toast.js').ToastAction} action
 * @returns {import('hybrids').UpdateFunctionWithMethods<AppToastHostHost>}
 */
function actionTemplate(toast, action) {
  const close = () => dismissToast(toast.id);
  if (action.href) {
    return html`<a
      class="app-toast-action"
      href="${action.href}"
      download="${action.download ? '' : false}"
      target="${action.download ? false : '_blank'}"
      rel="noopener"
      onclick="${close}"
      >${action.label}</a
    >`;
  }
  const run = () => {
    close();
    action.run?.();
  };
  return html`<button type="button" class="app-toast-action" onclick="${run}">
    ${action.label}
  </button>`;
}

/**
 * @param {import('#utils/ui/toast.js').Toast} toast
 * @returns {import('hybrids').UpdateFunctionWithMethods<AppToastHostHost>}
 */
function toastTemplate(toast) {
  return html`
    <div class="toast toast-${toast.kind}" role="${toast.kind === 'error' ? 'alert' : 'status'}">
      <app-icon class="app-toast-icon" name="${ICONS[toast.kind]}" size="sm"></app-icon>
      <div class="app-toast-text">
        <strong class="app-toast-title">${toast.title}</strong>
        ${toast.detail ? html`<span class="app-toast-detail">${toast.detail}</span>` : html``}
        ${toast.actions.length
          ? html`<span class="app-toast-actions"
              >${toast.actions.map((action) => actionTemplate(toast, action))}</span
            >`
          : html``}
      </div>
      <button
        type="button"
        class="icon-btn"
        aria-label="Dismiss"
        title="Dismiss"
        onclick="${() => dismissToast(toast.id)}"
      >
        <app-icon name="x" size="sm"></app-icon>
      </button>
    </div>
  `.key(toast.id);
}

/** @type {import('hybrids').Component<AppToastHostHost>} */
export default define({
  tag: 'app-toast-host',
  state: watch(toastState),
  render: {
    value: ({ state }) => html`
      <div class="toast-stack" aria-live="polite">${state.toasts.map(toastTemplate)}</div>
    `,
    shadow: false,
  },
});
