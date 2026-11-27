/**
 * Gesture table: every name the gesture chooser can return, mapped to the
 * module that carries it out.
 * @module utils/timeline/interaction/gestures
 */

import { copyDrag } from './copyDrag.js';
import { keyframeDrag } from './keyframeDrag.js';
import { marqueeDrag, panDrag } from './laneDrags.js';
import { moveDrag, slipDrag } from './moveDrag.js';
import { regionDrag, regionEndDrag, regionStartDrag } from './regionDrags.js';
import { loopDrag, markerDrag, scrubDrag } from './rulerDrags.js';
import * as slides from './slideDrags.js';
import { fadeInDrag, fadeOutDrag, trimEndDrag, trimStartDrag } from './trimDrag.js';

/** @type {Record<import('#utils/timeline/gestureChoice.js').GestureName, import('./press.js').Gesture>} */
export const GESTURES = {
  move: moveDrag,
  copy: copyDrag,
  slip: slipDrag,
  slide: slides.slideDrag,
  'trim-start': trimStartDrag,
  'trim-end': trimEndDrag,
  'slip-trim-start': slides.slipTrimStartDrag,
  'slip-trim-end': slides.slipTrimEndDrag,
  'roll-start': slides.rollStartDrag,
  'roll-end': slides.rollEndDrag,
  'fade-in': fadeInDrag,
  'fade-out': fadeOutDrag,
  keyframe: keyframeDrag,
  scrub: scrubDrag,
  loop: loopDrag,
  marker: markerDrag,
  region: regionDrag,
  'region-start': regionStartDrag,
  'region-end': regionEndDrag,
  marquee: marqueeDrag,
  pan: panDrag,
  none: {},
};
