/**
 * Edge auto-scroll: while a drag holds the pointer near the left or right
 * edge of the canvas, keep scrolling and re-applying the drag, so the clip
 * (or marquee, or scrub) keeps travelling.
 * @module utils/timeline/interaction/autoScroll
 */

import { getStageSize } from '#utils/timeline/metrics.js';
import { scrollBy } from '#utils/timeline/scroll.js';
import { edgeScrollSpeed } from '#utils/timeline/viewport.js';
import { GESTURES } from './gestures.js';

/** @typedef {import('#utils/timeline/stage.js').Stage} Stage */

/**
 * Start scrolling if the current drag is near an edge. Runs on animation
 * frames until the pointer leaves the edge or the press ends; safe to call
 * on every pointer move.
 * @param {Stage} stage
 */
export function autoScroll(stage) {
  const press = stage.press;
  if (press?.scrolling || !press?.dragging) return;
  const step = () => {
    press.scrolling = 0;
    if (stage.press !== press || !press.dragging) return;
    const speed = edgeScrollSpeed(press.x, getStageSize().width);
    if (!speed) return;
    GESTURES[press.gesture].drag?.(stage, press); // at the scroll reached last frame
    scrollBy(speed, 0);
    press.scrolling = requestAnimationFrame(step);
  };
  press.scrolling = requestAnimationFrame(step);
}
