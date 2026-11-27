/**
 * Gesture table: every name the gesture chooser can return, mapped to the
 * module that carries it out.
 * @module utils/timeline/interaction/gestures
 */

import { marqueeDrag, panDrag } from './laneDrags.js';
import { moveDrag, slipDrag } from './moveDrag.js';
import { loopDrag, markerDrag, scrubDrag } from './rulerDrags.js';
import { fadeInDrag, fadeOutDrag, trimEndDrag, trimStartDrag } from './trimDrag.js';

/** @type {Record<import('#utils/timeline/gestureChoice.js').GestureName, import('./press.js').Gesture>} */
export const GESTURES = {
  move: moveDrag,
  slip: slipDrag,
  'trim-start': trimStartDrag,
  'trim-end': trimEndDrag,
  'fade-in': fadeInDrag,
  'fade-out': fadeOutDrag,
  scrub: scrubDrag,
  loop: loopDrag,
  marker: markerDrag,
  marquee: marqueeDrag,
  pan: panDrag,
  none: {},
};
