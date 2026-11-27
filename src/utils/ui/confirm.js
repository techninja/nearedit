/**
 * Confirm prompts as a promise: `if (await confirmAction({...})) …`.
 * `<app-confirm-host>` (mounted once by the router) shows the question; one
 * is asked at a time and later ones wait their turn.
 * @module utils/ui/confirm
 */

import { createObservable } from '#utils/ui/observable.js';

/**
 * @typedef {Object} ConfirmRequest
 * @property {string} title
 * @property {string} message - May contain line breaks
 * @property {string} confirmLabel
 * @property {string} cancelLabel
 * @property {boolean} danger - The action destroys something; styled as such
 */

/** @type {import('#utils/ui/observable.js').Observable<{ request: ConfirmRequest|null }>} */
const state = createObservable({ request: null });
/** @type {{ request: ConfirmRequest, resolve: (answer: boolean) => void }[]} */
const queue = [];

export const confirmState = state;

/** Show the question at the head of the queue, if any. */
function showNext() {
  state.set({ request: queue[0]?.request || null });
}

/**
 * Ask the user to confirm something.
 * @param {{ title: string, message?: string, confirmLabel?: string, cancelLabel?: string,
 *   danger?: boolean }} options
 * @returns {Promise<boolean>} true when confirmed
 */
export function confirmAction(options) {
  const request = {
    title: options.title,
    message: options.message || '',
    confirmLabel: options.confirmLabel || 'OK',
    cancelLabel: options.cancelLabel || 'Cancel',
    danger: options.danger === true,
  };
  return new Promise((resolve) => {
    queue.push({ request, resolve });
    if (queue.length === 1) showNext();
  });
}

/**
 * Answer the question on screen (called by the host component).
 * @param {boolean} answer
 */
export function answerConfirm(answer) {
  const current = queue.shift();
  if (!current) return;
  current.resolve(answer);
  showNext();
}
