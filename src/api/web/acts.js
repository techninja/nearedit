/**
 * What each kind of step does, as an "act": the frames it spans, where the
 * pointer travels, what scrolls, which input events go out on which frame.
 * An act is made when its step begins — the moment its target is looked
 * for — and is then read by the performer on every frame until it ends.
 * Motion and timing come from `#utils/web` so the editor's preview and the
 * recording agree.
 * @module api/web/acts
 */

import { PRESS_SECONDS } from '#utils/web/index.js';
import { mouse } from './input.js';

/**
 * @typedef {import('./input.js').Command} Command
 * @typedef {Object} Span
 * @property {number} step - Index in the recipe
 * @property {number} S - First frame of the action
 * @property {number} A - Frame the action ends on
 * @property {number} E - Frame the hold ends on
 * @typedef {Object} ActParts
 * @property {string} ease
 * @property {number} [plan] - The page-side plan (target and scrolling) of this step
 * @property {string} [what] - The target as messages name it: `text=Sign in`
 * @property {number[][]} [scrolls] - Per scrolling box `[fromX, fromY, toX, toY]`
 * @property {number} [G] - The frame the pointer arrives on; absent when it does not travel
 * @property {{ x: number, y: number }} [from] - Where the pointer set off
 * @property {{ x: number, y: number }} [aim] - Where it is headed, as last measured
 * @property {[number, number][]} [down] - Frames the button is held: `[press, release)`
 * @property {number[]} [ripple] - Frames a click ripple starts on
 * @property {(n: number) => object|null} [mark] - The highlight to draw on a frame
 * @property {(n: number, at: { x: number, y: number }) => Command[]} [cue] - Input for a frame
 * @property {(n: number) => Promise<string>|string} [check] - Work on a frame that may fail: '' or why
 * @typedef {Span & ActParts} Act
 */

const FADE_SECONDS = 0.25;
const GAP_SECONDS = 0.08;

/**
 * The frames of a click's presses and releases.
 * @param {Span} span
 * @param {number} count - 1, 2 (double click) or 3
 * @param {number} fps
 * @returns {[number, number][]} `[press, release]`, never after the step's end
 */
export function clickFrames({ A, E }, count, fps) {
  const last = Math.max(A, E);
  const held = Math.max(1, Math.round(PRESS_SECONDS * fps));
  const gap = Math.max(1, Math.round(GAP_SECONDS * fps));
  return Array.from({ length: count }, (_, k) => {
    const press = Math.min(last, A + k * (held + gap));
    return [press, Math.min(last, press + held)];
  });
}

/**
 * The parts of an act that aims at something.
 * @param {any} step - A normalised step
 * @param {Span} span
 * @param {number} fps
 * @param {(name: string, ...args: any[]) => Promise<any>} call - The page helpers
 * @returns {ActParts} Without `plan`, `scrolls`, `aim`: the performer adds what the page found
 */
export function aimedParts(step, span, fps, call) {
  const { S, A, E } = span;
  const ease = step.ease;
  if (step.do === 'click') {
    const frames = clickFrames(span, step.count || 1, fps);
    const how = (/** @type {number} */ k) => ({ button: step.button || 'left', count: k + 1 });
    return {
      ...{ ease, G: A, down: frames, ripple: frames.map(([press]) => press) },
      cue: (n, at) =>
        frames.flatMap(([press, release], k) => [
          ...(n === press ? [mouse('mousePressed', at, how(k))] : []),
          ...(n === release ? [mouse('mouseReleased', at, how(k))] : []),
        ]),
    };
  }
  if (step.do === 'select') {
    return {
      ease,
      G: A,
      ripple: [A],
      check: (n) => (n === A ? call('choose', span.step, step.value) : ''),
    };
  }
  if (step.do === 'highlight') {
    const fade = Math.min(Math.round(FADE_SECONDS * fps), E - A);
    return {
      ease,
      mark(n) {
        const rise = A > S ? Math.min(1, (n - S) / (A - S)) : 1;
        const fall = fade > 0 ? Math.min(1, (E - n) / fade) : n < E ? 1 : 0;
        const opacity = Math.max(0, Math.min(rise, fall));
        return opacity > 0
          ? { plan: span.step, style: step.style, color: step.color, opacity }
          : null;
      },
    };
  }
  return step.do === 'focus' ? { ease } : { ease, G: A }; // move, hover
}
