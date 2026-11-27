/**
 * Dragging on empty space: marquee selection, and panning the view (middle
 * button, Space-drag, or a finger).
 * @module utils/timeline/interaction/laneDrags
 */

import { getDoc } from '#utils/editor/session.js';
import { getSelection, getView, setSelection } from '#utils/editor/view.js';
import { consumePanKey } from '#utils/keyboard/panKey.js';
import { isToggleClick } from '#utils/timeline/gestureChoice.js';
import { lanesBetween } from '#utils/timeline/layout.js';
import { marqueeSelection } from '#utils/timeline/reduce/marquee.js';
import { scrollTo } from '#utils/timeline/scroll.js';
import { timeToX, xToTimeRaw } from '#utils/timeline/viewport.js';
import { clickEmpty } from './clicks.js';

/** @typedef {import('./press.js').Gesture} Gesture */

/**
 * @type {Gesture} Marquee: the box is anchored in timeline time and lane
 *   space, so it keeps growing while the view auto-scrolls under it.
 */
export const marqueeDrag = {
  autoScroll: true,
  begin(_stage, press) {
    press.data.initial = getSelection();
    press.data.last = '';
  },
  drag(stage, press) {
    const { vp, lanes } = stage.geometry();
    const y0 = press.y0 + press.scrollY0 - vp.scrollY;
    stage.overlay.marquee = { x0: timeToX(vp, press.time0), y0, x1: press.x, y1: press.y };
    const box = {
      t0: press.time0,
      t1: xToTimeRaw(vp, press.x),
      trackIds: lanesBetween(lanes, y0, press.y, vp.scrollY),
    };
    const toggle = isToggleClick(press.input);
    const ids = marqueeSelection(getDoc(), box, press.data.initial, toggle);
    const key = ids.join('|');
    if (key !== press.data.last) setSelection(ids, { expand: false });
    press.data.last = key;
  },
  cancel(_stage, press) {
    setSelection(press.data.initial, { expand: false });
  },
  click: clickEmpty,
};

/** @type {Gesture} Pan: the content follows the pointer. */
export const panDrag = {
  down(_stage, press) {
    const { scrollX, scrollY } = getView();
    press.data.from = { scrollX, scrollY };
  },
  begin(_stage, press) {
    if (press.input.panKey) consumePanKey();
  },
  drag(_stage, press) {
    const { scrollX, scrollY } = press.data.from;
    scrollTo({ x: scrollX - (press.x - press.x0), y: scrollY - (press.y - press.y0) });
  },
  click(stage, press) {
    // A finger on empty space pans when dragged; a tap is a plain click.
    if (press.pointerType === 'touch' && !press.input.panKey) clickEmpty(stage, press);
  },
};
