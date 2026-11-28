/**
 * Things that arrive after a frame was drawn and change what the timeline
 * shows without changing the document or the view: a filmstrip, a
 * waveform, and where the rendering of a music clip stands.
 * @module utils/timeline/arrivals
 */

import { renderState } from '#utils/musicUi/renderState.js';
import { onStripLoaded } from './thumbCache.js';
import { onWaveLoaded } from './waveCache.js';

/**
 * Be told when any of them arrived (to redraw).
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function onArrival(listener) {
  const stops = [
    onStripLoaded(listener),
    onWaveLoaded(listener),
    renderState.subscribe(() => listener()),
  ];
  return () => stops.forEach((stop) => stop());
}
