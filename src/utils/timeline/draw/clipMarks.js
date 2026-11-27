/**
 * Marks on a clip: the colour swatch of a generator, the "fx" badge of a
 * clip with effects, and the diamonds of its keyframes along the bottom.
 * Each is a few rectangles; nothing here runs the compositor.
 * @module utils/timeline/draw/clipMarks
 */

import {
  KEY_BAND,
  generatorColors,
  hasActiveEffects,
  keyMarks,
} from '#utils/timeline/clipMarks.js';
import { timeToX } from '#utils/timeline/viewport.js';

/** @typedef {import('./scene.js').Scene} Scene */
/** @typedef {{ x0: number, x1: number, y: number, height: number }} ClipBox */

/** Width of the "fx" badge with its margin. */
export const BADGE_W = 22;
/** Narrower than this a clip shows no badge. */
const BADGE_MIN = 56;
const SWATCH_H = 5;

/**
 * A band of the generator's colours under the label strip.
 * @param {Scene} scene
 * @param {any} clip
 * @param {ClipBox} box
 * @param {number} top - Where the band starts (below the label)
 */
export function drawGeneratorSwatch(scene, clip, box, top) {
  const colors = generatorColors(clip.generator);
  const left = Math.max(box.x0, 0) + 4;
  const right = Math.min(box.x1, scene.vp.width) - 4;
  if (!colors.length || right - left < 12 || box.y + box.height - top < SWATCH_H + 3) return;
  const { ctx } = scene;
  const step = (right - left) / colors.length;
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(left + i * step, top, step + 0.5, SWATCH_H);
  });
  ctx.strokeStyle = scene.palette.clipText;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.strokeRect(left - 0.5, top - 0.5, right - left + 1, SWATCH_H + 1);
  ctx.globalAlpha = 1;
}

/**
 * @param {any} clip
 * @param {ClipBox} box
 * @returns {boolean} True when the clip shows the "fx" badge
 */
export const showsBadge = (clip, box) => box.x1 - box.x0 >= BADGE_MIN && hasActiveEffects(clip);

/**
 * The "fx" badge at the right end of the label strip.
 * @param {Scene} scene
 * @param {ClipBox} box
 */
export function drawEffectBadge(scene, box) {
  const { ctx, palette, vp } = scene;
  const x = Math.min(box.x1, vp.width + 8) - BADGE_W + 2;
  ctx.fillStyle = 'rgb(0 0 0 / 40%)';
  ctx.beginPath();
  ctx.roundRect(x, box.y + 2, BADGE_W - 5, 11, 3);
  ctx.fill();
  ctx.font = `bold 9px ${palette.sans}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.clipText;
  ctx.fillText('fx', x + 4, box.y + 8);
}

/**
 * The keyframe diamonds along the bottom of a clip.
 * @param {Scene} scene
 * @param {any} clip
 * @param {ClipBox} box
 */
export function drawKeyMarks(scene, clip, box) {
  const { ctx, vp, palette } = scene;
  const marks = keyMarks(clip, vp.pps);
  if (!marks.length || box.height < KEY_BAND + 4) return;
  const y = box.y + box.height - KEY_BAND / 2;
  const size = scene.coarse ? 5 : 4;
  const held = scene.overlay.keyMark;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgb(0 0 0 / 55%)';
  for (const time of marks) {
    const x = timeToX(vp, time);
    if (x < -size || x > vp.width + size) continue;
    const active = held && held.clipId === clip.clipId && Math.abs(held.time - time) < 1e-6;
    ctx.fillStyle = active ? palette.selection : palette.clipText;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
