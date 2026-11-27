/**
 * Splitter atom — the bar between two panes. It knows nothing about the
 * panes: it reports a drag as events and the owner resizes.
 *   `splitstart`, `splitmove` (`detail.delta`: px travelled along the drag
 *   axis since the start), `splitend`, `splitkey` (`detail.key`: an arrow
 *   key pressed while focused), `splitreset` (double-click or Enter).
 * Works with mouse, touch and pen (pointer events, with capture).
 * @module components/atoms/app-splitter
 */

import { html, define, dispatch } from 'hybrids';

/**
 * @typedef {Object} AppSplitterHost
 * @property {'vertical'|'horizontal'} orientation - `vertical`: a vertical bar dragged sideways
 * @property {string} label - Accessible name, e.g. "Resize the timeline"
 */

/** @type {WeakMap<HTMLElement, { origin: number, frame: number, delta: number }>} */
const drags = new WeakMap();

/** @param {AppSplitterHost} host @param {PointerEvent} event @returns {number} */
const along = (host, event) => (host.orientation === 'vertical' ? event.clientX : event.clientY);

/** @param {AppSplitterHost & HTMLElement} host @param {PointerEvent} event */
function handlePointerDown(host, event) {
  if (event.button !== 0 || drags.has(host)) return;
  event.preventDefault(); // no text selection, no touch scrolling
  /** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
  drags.set(host, { origin: along(host, event), frame: 0, delta: 0 });
  host.toggleAttribute('dragging', true);
  dispatch(host, 'splitstart', { bubbles: true });
}

/** @param {AppSplitterHost & HTMLElement} host @param {PointerEvent} event */
function handlePointerMove(host, event) {
  const drag = drags.get(host);
  if (!drag) return;
  drag.delta = along(host, event) - drag.origin;
  // One resize per frame, however fast the pointer reports.
  drag.frame ||= requestAnimationFrame(() => {
    drag.frame = 0;
    if (drags.get(host) === drag) {
      dispatch(host, 'splitmove', { detail: { delta: drag.delta }, bubbles: true });
    }
  });
}

/** @param {AppSplitterHost & HTMLElement} host @param {PointerEvent} event */
function handlePointerUp(host, event) {
  const drag = drags.get(host);
  if (!drag) return;
  drags.delete(host);
  cancelAnimationFrame(drag.frame);
  // A cancelled gesture carries no position: it ends where the last move was.
  if (event.type === 'pointerup') drag.delta = along(host, event) - drag.origin;
  host.toggleAttribute('dragging', false);
  dispatch(host, 'splitmove', { detail: { delta: drag.delta }, bubbles: true });
  dispatch(host, 'splitend', { bubbles: true });
}

/** @param {AppSplitterHost & HTMLElement} host @param {KeyboardEvent} event */
function handleKeydown(host, event) {
  if (event.key === 'Enter') dispatch(host, 'splitreset', { bubbles: true });
  else if (event.key.startsWith('Arrow')) {
    dispatch(host, 'splitkey', { detail: { key: event.key }, bubbles: true });
  } else return;
  event.preventDefault();
  event.stopPropagation(); // arrows on a splitter resize; they do not step frames
}

/** @param {AppSplitterHost & HTMLElement} host */
function handleDoubleClick(host) {
  dispatch(host, 'splitreset', { bubbles: true });
}

/** @type {import('hybrids').Component<AppSplitterHost>} */
export default define({
  tag: 'app-splitter',
  orientation: { value: 'horizontal', reflect: true },
  label: '',
  render: {
    value: ({ orientation, label }) => html`
      <div
        class="app-splitter-grip"
        role="separator"
        tabindex="0"
        aria-orientation="${orientation}"
        aria-label="${label}"
        title="${`${label} — drag, or use the arrow keys; double-click to reset`}"
        onpointerdown="${handlePointerDown}"
        onpointermove="${handlePointerMove}"
        onpointerup="${handlePointerUp}"
        onpointercancel="${handlePointerUp}"
        onkeydown="${handleKeydown}"
        ondblclick="${handleDoubleClick}"
      ></div>
    `,
    shadow: false,
  },
});
