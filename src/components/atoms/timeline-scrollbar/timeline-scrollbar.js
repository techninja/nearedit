/**
 * Timeline scrollbar — a slim track with a draggable thumb. Unlike a
 * native scrollbar it has no content element, so it stays exact when the
 * timeline is tens of millions of pixels wide at full zoom. Dispatches
 * `scrollto` (detail: the wanted scroll position in pixels).
 * @module components/atoms/timeline-scrollbar
 */

import { html, define, dispatch } from 'hybrids';

/**
 * @typedef {Object} TimelineScrollbarHost
 * @property {'x'|'y'} axis
 * @property {number} value - Scroll position, pixels
 * @property {number} page - Visible size, pixels
 * @property {number} total - Content size, pixels
 */

/** @type {WeakMap<HTMLElement, { from: number, value: number }>} Thumb drags in progress */
const grabs = new WeakMap();

/**
 * Position and size of the thumb as percentages of the track.
 * @param {{ value: number, page: number, total: number }} host
 * @returns {{ at: number, size: number, idle: boolean }}
 */
export function thumbGeometry({ value, page, total }) {
  const range = total - page;
  if (!(range > 1) || !(page > 0)) return { at: 0, size: 100, idle: true };
  const size = Math.max(6, (page / total) * 100);
  const at = (Math.min(Math.max(value, 0), range) / range) * (100 - size);
  return { at, size, idle: false };
}

/**
 * @param {TimelineScrollbarHost & HTMLElement} host
 * @param {number} value
 */
function scrollTo(host, value) {
  const max = Math.max(0, host.total - host.page);
  dispatch(host, 'scrollto', { detail: Math.max(0, Math.min(max, value)), bubbles: true });
}

/**
 * @param {TimelineScrollbarHost} host
 * @param {PointerEvent} event
 * @returns {number} Pointer position along the bar's axis
 */
const along = (host, event) => (host.axis === 'y' ? event.clientY : event.clientX);

/**
 * Press on the track outside the thumb: page towards the pointer.
 * @param {TimelineScrollbarHost & HTMLElement} host
 * @param {PointerEvent} event
 */
function handleTrackDown(host, event) {
  if (event.target !== event.currentTarget) return;
  const thumb = /** @type {HTMLElement} */ (event.currentTarget).firstElementChild;
  const rect = thumb.getBoundingClientRect();
  const before = along(host, event) < (host.axis === 'y' ? rect.top : rect.left);
  scrollTo(host, host.value + (before ? -1 : 1) * host.page * 0.9);
}

/**
 * @param {TimelineScrollbarHost & HTMLElement} host
 * @param {PointerEvent} event
 */
function handleThumbDown(host, event) {
  /** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
  grabs.set(host, { from: along(host, event), value: host.value });
  event.preventDefault();
}

/**
 * @param {TimelineScrollbarHost & HTMLElement} host
 * @param {PointerEvent} event
 */
function handleThumbMove(host, event) {
  const grab = grabs.get(host);
  if (!grab) return;
  const thumb = /** @type {HTMLElement} */ (event.currentTarget);
  const track = thumb.parentElement.getBoundingClientRect();
  const own = thumb.getBoundingClientRect();
  const travel = host.axis === 'y' ? track.height - own.height : track.width - own.width;
  if (!(travel > 0)) return;
  const moved = along(host, event) - grab.from;
  scrollTo(host, grab.value + (moved / travel) * (host.total - host.page));
}

/** @param {TimelineScrollbarHost & HTMLElement} host */
function handleThumbUp(host) {
  grabs.delete(host);
}

/** @type {import('hybrids').Component<TimelineScrollbarHost>} */
export default define({
  tag: 'timeline-scrollbar',
  axis: 'x',
  value: 0,
  page: 0,
  total: 0,
  render: {
    value: (host) => {
      const { at, size, idle } = thumbGeometry(host);
      const vertical = host.axis === 'y';
      const style = vertical
        ? { top: `${at}%`, height: `${size}%`, left: '', width: '' }
        : { left: `${at}%`, width: `${size}%`, top: '', height: '' };
      return html`
        <div
          class="${{ 'timeline-scrollbar': true, vertical, idle }}"
          onpointerdown="${handleTrackDown}"
        >
          <div
            class="timeline-scrollbar-thumb"
            style="${style}"
            onpointerdown="${handleThumbDown}"
            onpointermove="${handleThumbMove}"
            onpointerup="${handleThumbUp}"
            onpointercancel="${handleThumbUp}"
          ></div>
        </div>
      `;
    },
    shadow: false,
  },
});
