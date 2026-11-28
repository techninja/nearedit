/**
 * The acts of the keyboard: `type` (reach the field, click it, then one key
 * per character on the frames the shared timing gives — never one before
 * the click) and `press` (one key, held for the step's duration).
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
  // No key before the click: the keys of a frame follow its press in one batch, which the
  // browser handles in order, so they find the field with the focus — and emptied first.
  const first = aimed ? G : S;
  const typed = (/** @type {number} */ n) =>
    n < first ? 0 : typedLength(step, (n - S) / fps, seconds);
  return {
    ease: step.ease,
    ...(aimed && { G, down: [[G, release]], ripple: [G] }),
    cue: (n, at) => [
      ...(aimed && n === G ? [mouse('mousePressed', at, { button: 'left', count: 1 })] : []),
      ...(aimed && n === release ? [mouse('mouseReleased', at, { button: 'left', count: 1 })] : []),
      ...(step.clear && n === first ? CLEAR_FIELD : []),
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
