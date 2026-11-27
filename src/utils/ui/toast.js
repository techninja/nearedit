/**
 * Toasts — short messages in the corner of the screen. Any code may call
 * `showToast`; `<app-toast-host>` (mounted once by the router) shows them.
 * @module utils/ui/toast
 */

import { createObservable } from '#utils/ui/observable.js';

/**
 * @typedef {Object} ToastAction
 * @property {string} label
 * @property {string} [href] - Rendered as a link (downloads, pages)
 * @property {boolean} [download] - The link downloads instead of navigating
 * @property {() => void} [run] - Rendered as a button
 * @typedef {Object} Toast
 * @property {number} id
 * @property {'info'|'success'|'error'} kind
 * @property {string} title
 * @property {string} detail
 * @property {ToastAction[]} actions
 * @property {number} timeout - Milliseconds until it goes away; 0 = stays
 */

const TIMEOUTS = { info: 6000, success: 6000, error: 12000 };
const MAX_VISIBLE = 4;

/** @type {import('#utils/ui/observable.js').Observable<{ toasts: Toast[] }>} */
const state = createObservable({ toasts: [] });
/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const timers = new Map();
let nextId = 1;

export const toastState = state;

/**
 * Remove a toast.
 * @param {number} id
 */
export function dismissToast(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  state.set({ toasts: state.get().toasts.filter((toast) => toast.id !== id) });
}

/**
 * Show a toast. Toasts with actions stay twice as long, so there is time
 * to reach the button.
 * @param {{ title: string, detail?: string, kind?: Toast['kind'], actions?: ToastAction[],
 *   timeout?: number }} options
 * @returns {number} The toast's id, for `dismissToast`
 */
export function showToast(options) {
  const { title, detail = '', kind = 'info', actions = [] } = options;
  const timeout = options.timeout ?? TIMEOUTS[kind] * (actions.length ? 2 : 1);
  const toast = { id: nextId++, kind, title, detail, actions, timeout };
  const toasts = [...state.get().toasts, toast];
  // Old toasts make way so the stack never covers the screen.
  for (const old of toasts.slice(0, Math.max(0, toasts.length - MAX_VISIBLE))) {
    clearTimeout(timers.get(old.id));
    timers.delete(old.id);
  }
  state.set({ toasts: toasts.slice(-MAX_VISIBLE) });
  if (timeout > 0) timers.set(toast.id, setTimeout(() => dismissToast(toast.id), timeout));
  return toast.id;
}

/**
 * Shorthand for a failure message built from an Error.
 * @param {string} title - What was being attempted, e.g. "Could not save the project"
 * @param {unknown} [error]
 * @returns {number}
 */
export function showError(title, error) {
  const body = /** @type {any} */ (error)?.body;
  const detail = [/** @type {any} */ (error)?.message, body?.detail].filter(Boolean).join(' — ');
  return showToast({ kind: 'error', title, detail });
}

/** Remove every toast (tests, page teardown). */
export function clearToasts() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  state.set({ toasts: [] });
}
