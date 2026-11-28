/**
 * The score strip of the web editor, as data: the recording laid out as
 * blocks — the lead, every step's action and its hold, the tail — and what
 * dragging the end of a block means for the recipe. Lengths are whole
 * frames, as the score's are. Pure and isomorphic.
 * @module utils/webUi/scoreStrip
 */

import { RECIPE_LIMITS, compileScore, stepLabel } from '#utils/web/index.js';
import { patchStep } from './recipeEdit.js';

/** @typedef {import('#utils/web/types.js').Recipe} Recipe */

/**
 * @typedef {Object} StripBlock
 * @property {'lead'|'duration'|'hold'|'tail'} part - Also the name of the
 *   field its length is: of the recipe (`lead`, `tail`) or of the step
 * @property {number} index - The step; -1 for the lead and the tail
 * @property {number} start - Seconds
 * @property {number} end
 * @property {number} frames - Its length
 * @property {string} label - What it is, for a tooltip and a screen reader
 */

/** Frames an arrow key moves the end of a block, with and without Shift. */
export const KEY_FRAMES = { fine: 1, coarse: 10 };

/**
 * @param {Recipe} recipe - Normalised
 * @param {number} fps
 * @returns {{ blocks: StripBlock[], duration: number, frames: number, fps: number }}
 */
export function stripBlocks(recipe, fps) {
  const score = compileScore(recipe, fps);
  const rate = score.fps;
  const frames = (/** @type {number} */ seconds) => Math.round(seconds * rate);
  const last = score.steps[score.steps.length - 1];
  const leadEnd = score.steps.length ? score.steps[0].start : frames(recipe.lead) / rate;
  /** @type {StripBlock[]} */
  const blocks = [];
  const add = (part, index, start, end, label) =>
    blocks.push({ part, index, start, end, frames: frames(end - start), label });
  add('lead', -1, 0, leadEnd, 'Lead: the loaded page, before the first step');
  for (const at of score.steps) {
    const name = `${at.index + 1}. ${stepLabel(recipe.steps[at.index])}`;
    add('duration', at.index, at.start, at.actionEnd, name);
    add('hold', at.index, at.actionEnd, at.end, `${name} — hold`);
  }
  const tailStart = last ? last.end : leadEnd;
  add('tail', -1, tailStart, Math.max(tailStart, score.duration), 'Tail: after the last step');
  return { blocks, duration: score.duration, frames: score.frames, fps: rate };
}

/**
 * Give a block a new length.
 * @param {Recipe} recipe
 * @param {{ part: StripBlock['part'], index: number }} block
 * @param {number} frames - Whole frames, 0 or more
 * @param {number} fps
 * @returns {Recipe}
 */
export function retime(recipe, block, frames, fps) {
  const most = Math.floor(RECIPE_LIMITS.seconds * fps);
  const seconds = Math.max(0, Math.min(most, Math.round(frames))) / fps;
  if (block.part === 'lead' || block.part === 'tail') return { ...recipe, [block.part]: seconds };
  return patchStep(recipe, block.index, { [block.part]: seconds });
}

/**
 * The length of a block while its end is dragged.
 * @param {number} startFrames - Its length when the drag began
 * @param {number} dx - Pointer travel, pixels
 * @param {number} pps - Pixels per second of the strip when the drag began
 * @param {number} fps
 * @returns {number} Whole frames, never below 0
 */
export function draggedFrames(startFrames, dx, pps, fps) {
  if (!(pps > 0)) return startFrames;
  return Math.max(0, startFrames + Math.round((dx / pps) * fps));
}

/**
 * The length of a block after a key press on its handle.
 * @param {number} frames
 * @param {{ key: string, shiftKey?: boolean }} event
 * @returns {number|null} null when the key does not retime
 */
export function keyFrames(frames, { key, shiftKey }) {
  const step = shiftKey ? KEY_FRAMES.coarse : KEY_FRAMES.fine;
  const by = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[key];
  return by === undefined ? null : Math.max(0, frames + by);
}

/**
 * The time a point of the strip stands for.
 * @param {number} x - Pixels from the strip's left edge
 * @param {number} width - Of the strip
 * @param {number} duration - Seconds the strip shows
 * @param {number} fps
 * @returns {number} Seconds, on a frame, inside the recording
 */
export function timeAtX(x, width, duration, fps) {
  if (!(width > 0)) return 0;
  const time = (Math.max(0, Math.min(width, x)) / width) * duration;
  return Math.min(Math.round(time * fps) / fps, Math.max(0, duration - 1 / fps));
}

/**
 * The step a time of the recording belongs to.
 * @param {StripBlock[]} blocks
 * @param {number} time
 * @returns {number} Its index; -1 in the lead and the tail
 */
export function stepAtTime(blocks, time) {
  const block = blocks.find((each) => time >= each.start && time < each.end);
  return block ? block.index : -1;
}
