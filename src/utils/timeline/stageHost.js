/**
 * Binding a stage to the element that hosts its canvas: created once the
 * canvas has been rendered, torn down when the host leaves the page.
 * @module utils/timeline/stageHost
 */

import { watchEscape } from './interaction/events.js';
import { createStage } from './stage.js';

/** @typedef {import('./stage.js').Stage} Stage */

/** @type {WeakMap<Element, Stage>} */
const stages = new WeakMap();

/**
 * The stage behind a host element (a `<timeline-stage>`), if it exists yet.
 * Also what tests and diagnostics use to reach `stage.stats`.
 * @param {Element} host
 * @returns {Stage|undefined}
 */
export const timelineStage = (host) => stages.get(host);

/**
 * Create the host's stage as soon as its canvas is in the DOM. Safe to call
 * after every render.
 * @param {Element} host
 * @param {() => import('./stage.js').StageUi} ui - Built only when the stage is created
 */
export function ensureStage(host, ui) {
  const canvas = host.querySelector('canvas');
  if (canvas && !stages.has(host)) stages.set(host, createStage(canvas, ui()));
}

/**
 * Call when the host connects.
 * @param {Element} host
 * @returns {() => void} Call when it disconnects: destroys the stage
 */
export function connectStage(host) {
  const stopEscape = watchEscape(() => stages.get(host));
  return () => {
    stopEscape();
    stages.get(host)?.destroy();
    stages.delete(host);
  };
}
