/**
 * Dialog atom — the behaviour of a modal: it shows while `open`, moves
 * focus in and gives it back, keeps Tab inside, and asks to be closed on
 * Escape or a click on the backdrop. It renders nothing itself: the parent
 * supplies the content (see `dialogFrame` in `#utils/ui/dialogFrame.js`)
 * and closes it by handling the `close` event.
 * @module components/atoms/app-dialog
 */

import { define, dispatch } from 'hybrids';
import { focusInto, trapTab } from '#utils/ui/focus.js';

/**
 * @typedef {Object} AppDialogHost
 * @property {boolean} open
 * @property {boolean} modal - Internal: wires the listeners while connected
 */

/** @type {WeakMap<HTMLElement, HTMLElement|null>} What had focus before the dialog opened */
const returnTo = new WeakMap();

/**
 * @param {HTMLElement} host
 * @param {'escape'|'backdrop'} reason
 */
function requestClose(host, reason) {
  dispatch(host, 'close', { detail: { reason } });
}

/**
 * Give focus back to where it was before the dialog opened.
 * @param {HTMLElement} host
 */
function restoreFocus(host) {
  const previous = returnTo.get(host);
  returnTo.delete(host);
  if (previous?.isConnected) previous.focus({ preventScroll: true });
}

/**
 * @param {AppDialogHost & HTMLElement} host
 * @param {boolean} open
 * @param {boolean|undefined} wasOpen
 */
function handleOpenChange(host, open, wasOpen) {
  if (open) {
    returnTo.set(host, /** @type {HTMLElement|null} */ (host.ownerDocument.activeElement));
    // The parent renders the content in the same pass; focus once it exists.
    requestAnimationFrame(() => {
      if (host.open && host.isConnected) focusInto(host);
    });
  } else if (wasOpen) {
    restoreFocus(host);
  }
}

/**
 * @param {AppDialogHost & HTMLElement} host
 * @returns {() => void} disconnect
 */
function connectModal(host) {
  host.classList.add('dialog-backdrop');
  host.tabIndex = -1; // clicks on empty parts of the dialog keep focus inside it
  let pressedBackdrop = false;

  /** @param {KeyboardEvent} event */
  const onKeydown = (event) => {
    // Nothing typed in a dialog may reach the editor's shortcuts behind it.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose(host, 'escape');
    } else trapTab(host, event);
  };
  /** @param {Event} event */
  const onPointerDown = (event) => {
    pressedBackdrop = event.target === host;
  };
  /** @param {Event} event */
  const onClick = (event) => {
    // Only a click that both starts and ends on the backdrop closes: a text
    // selection dragged out of the dialog must not.
    if (pressedBackdrop && event.target === host) requestClose(host, 'backdrop');
    pressedBackdrop = false;
  };

  /**
   * Focus can fall out of an open dialog (the focused button was
   * re-rendered away, the page was clicked). Keys typed then still belong
   * to the top dialog: Escape closes it, Tab goes back in, nothing reaches
   * the editor behind.
   * @param {KeyboardEvent} event
   */
  const onStrayKeydown = (event) => {
    const open = host.ownerDocument.querySelectorAll('app-dialog[open]');
    const inside = /** @type {Element} */ (event.target).closest?.('app-dialog[open]');
    if (!host.open || inside || open[open.length - 1] !== host) return;
    event.stopPropagation();
    if (event.key === 'Escape') requestClose(host, 'escape');
    else if (event.key === 'Tab') {
      event.preventDefault();
      focusInto(host);
    }
  };

  host.addEventListener('keydown', onKeydown);
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('click', onClick);
  host.ownerDocument.addEventListener('keydown', onStrayKeydown, true);
  return () => {
    host.ownerDocument.removeEventListener('keydown', onStrayKeydown, true);
    host.removeEventListener('keydown', onKeydown);
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('click', onClick);
    if (host.open) restoreFocus(host);
  };
}

/** @type {import('hybrids').Component<AppDialogHost>} */
export default define({
  tag: 'app-dialog',
  open: { value: false, reflect: true, observe: handleOpenChange },
  modal: { value: true, connect: connectModal },
});
