/**
 * The acts of the keyboard: `type` (reach the field, click it, then one key
 * per character on the frames the shared timing gives) and `press` (one
 * key, held for the step's duration).
 * @module api/web/typing
 */

import {
  PRESS_SECONDS,
  parseTarget,
  typeApproach,
  typedCharacters,
  typedLength,
} from '#utils/web/index.js';
import { CLEAR_FIELD, mouse, pressKey, typeChar } from './input.js';

/** @typedef {import('./acts.js').Span} Span */
/** @typedef {import('./acts.js').ActParts} ActParts */

/**
 * The parts of a `type` step: reach the field and click it when there is a
 * target, then one key per character on the frames `typedLength` gives.
 * @param {any} step
 * @param {Span} span
 * @param {number} fps
 * @returns {ActParts}
 */
export function typeParts(step, { S, A, E }, fps) {
  const seconds = (A - S) / fps;
  const aimed = !!parseTarget(step.target);
  const G = S + Math.round(Math.min(typeApproach(step), seconds) * fps);
  const release = Math.min(
    Math.max(A, E),
    G + Math.max(1, Math.min(2, Math.round(PRESS_SECONDS * fps))),
  );
  const chars = typedCharacters(step);
  const typed = (/** @type {number} */ n) =>
    n < S ? 0 : typedLength(step, (n - S) / fps, seconds);
  // A click only lands when its frame is drawn: the field has the focus one frame later.
  const clearOn = aimed ? Math.min(G + 1, Math.max(A, E)) : S;
  return {
    ease: step.ease,
    ...(aimed && { G, down: [[G, release]], ripple: [G] }),
    cue: (n, at) => [
      ...(aimed && n === G ? [mouse('mousePressed', at, { button: 'left', count: 1 })] : []),
      ...(aimed && n === release ? [mouse('mouseReleased', at, { button: 'left', count: 1 })] : []),
      ...(step.clear && n === clearOn ? CLEAR_FIELD : []),
      ...chars.slice(typed(n - 1), typed(n)).flatMap(typeChar),
    ],
  };
}

/**
 * The parts of a `press` step: the key goes down when the step starts and
 * comes up when its action ends.
 * @param {any} step
 * @param {Span} span
 * @returns {ActParts|null} null when the step names no key there is
 */
export function pressParts(step, { S, A }) {
  const down = pressKey(step.key, step.modifiers || [], 'down');
  const up = pressKey(step.key, step.modifiers || [], 'up');
  if (!down || !up) return null;
  return { ease: step.ease, cue: (n) => [...(n === S ? down : []), ...(n === A ? up : [])] };
}
