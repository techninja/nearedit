/**
 * Desktop notifications for finished jobs. Permission is never requested
 * on page load: the first time a long job starts, a toast offers to turn
 * notifications on, and only its button triggers the browser's prompt.
 * @module utils/ui/notify
 */

import { store } from 'hybrids';
import UserPrefs, { setUserPrefs } from '#store/UserPrefs.js';
import { showToast } from '#utils/ui/toast.js';

/** @typedef {'unsupported'|'default'|'granted'|'denied'} Permission */

let offered = false;

/** @returns {Permission} */
export function notificationPermission() {
  const api = globalThis.Notification;
  return api ? /** @type {Permission} */ (api.permission) : 'unsupported';
}

/**
 * Whether a finished job raises a desktop notification. (It always gets
 * an in-app toast; that is not decided here.)
 * @param {{ permission: Permission, preference: string, hidden: boolean }} situation -
 *   `hidden`: the tab is in the background
 * @returns {boolean}
 */
export function wantsSystemNotification({ permission, preference, hidden }) {
  return hidden && permission === 'granted' && preference !== 'off';
}

/**
 * Whether to offer notifications now (the soft ask before the browser's own).
 * @param {{ permission: Permission, preference: string, offered: boolean }} situation
 * @returns {boolean}
 */
export function shouldOffer({ permission, preference, offered: already }) {
  return permission === 'default' && preference === 'ask' && !already;
}

/**
 * State of the notification switch in the job tray.
 * @param {Permission} permission
 * @param {string} preference
 * @returns {{ on: boolean, canToggle: boolean, hint: string }}
 */
export function notificationSwitch(permission, preference) {
  if (permission === 'unsupported')
    return { on: false, canToggle: false, hint: 'This browser has no desktop notifications' };
  if (permission === 'denied')
    return {
      on: false,
      canToggle: false,
      hint: 'Notifications are blocked for this site — allow them in the browser’s site settings',
    };
  const on = permission === 'granted' && preference !== 'off';
  const hint = on
    ? 'Desktop notifications are on for finished jobs — click to turn off'
    : 'Notify me when a job finishes while this tab is in the background';
  return { on, canToggle: true, hint };
}

/**
 * Turn notifications on, asking the browser for permission if needed.
 * Call from a click handler.
 * @returns {Promise<Permission>} The permission afterwards
 */
export async function enableNotifications() {
  let permission = notificationPermission();
  if (permission === 'default') {
    permission = /** @type {Permission} */ (await globalThis.Notification.requestPermission());
  }
  setUserPrefs({ notifications: permission === 'granted' ? 'on' : 'off' });
  if (permission === 'denied')
    showToast({
      title: 'Notifications are blocked',
      detail: 'The browser refused. You can allow them for this site in its settings.',
    });
  return permission;
}

/** Turn notifications off (the browser permission stays as it is). */
export function disableNotifications() {
  setUserPrefs({ notifications: 'off' });
}

/**
 * Call when the user starts a job that may take a while: offers
 * notifications once, if the question is still open.
 */
export function noteLongJobStarted() {
  const preference = store.get(UserPrefs).notifications;
  if (!shouldOffer({ permission: notificationPermission(), preference, offered })) return;
  offered = true;
  showToast({
    title: 'Want a notification when this is done?',
    detail:
      'Long jobs keep running on the server. NearEdit can tell you when one finishes while you are in another tab.',
    timeout: 20000,
    actions: [
      { label: 'Notify me', run: () => void enableNotifications() },
      { label: 'No thanks', run: disableNotifications },
    ],
  });
}

/**
 * Raise a desktop notification when the situation calls for one.
 * @param {{ title: string, body: string, tag: string }} message
 * @returns {boolean} true when a notification was raised
 */
export function notifyIfHidden({ title, body, tag }) {
  const situation = {
    permission: notificationPermission(),
    preference: store.get(UserPrefs).notifications,
    hidden: globalThis.document?.visibilityState === 'hidden',
  };
  if (!wantsSystemNotification(situation)) return false;
  try {
    const notification = new globalThis.Notification(title, { body, tag });
    notification.onclick = () => {
      globalThis.focus();
      notification.close();
    };
    return true;
  } catch (err) {
    // Some platforms only allow notifications from a service worker.
    console.warn('[notify] could not show a notification:', err.message);
    return false;
  }
}
