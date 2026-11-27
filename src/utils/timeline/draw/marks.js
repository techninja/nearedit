/**
 * Marks the keyboard leaves on the canvas: the edge chosen in edge-trim
 * mode, and the arrow that shows what a post-edit ripple (F) would do.
 * @module utils/timeline/draw/marks
 */

import { CLIP_INSET, RULER_H, laneY } from '#utils/timeline/layout.js';
import { timeToX } from '#utils/timeline/viewport.js';

/** @typedef {import('./scene.js').Scene} Scene */

/**
 * A bracket hugging a clip edge, with an arrowhead pointing into the clip.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - The edge
 * @param {number} y - Clip top
 * @param {number} height - Clip height
 * @param {1|-1} into - Which way the clip lies: 1 = to the right
 * @param {number} grow - Extra thickness, for the outline pass
 */
function bracket(ctx, x, y, height, into, grow) {
  const thick = 4 + 2 * grow;
  const arm = 12 + 2 * grow;
  const armX = into > 0 ? x - 2 - grow : x - 10 - grow;
  const top = y - 3 - grow;
  ctx.fillRect(x - 2 - grow, top, thick, height + 6 + 2 * grow);
  ctx.fillRect(armX, top, arm, thick);
  ctx.fillRect(armX, y + height - 1 - grow, arm, thick);
  const middle = y + height / 2;
  ctx.beginPath();
  ctx.moveTo(x + into * (6 - grow), middle - 6 - grow);
  ctx.lineTo(x + into * (13 + grow), middle);
  ctx.lineTo(x + into * (6 - grow), middle + 6 + grow);
  ctx.closePath();
  ctx.fill();
}

/**
 * Edge-trim mode: a bracket in the snap colour on the chosen edge (outlined
 * in the background colour, so it reads over any picture) and a glow on the
 * clip's side of it.
 * @param {Scene} scene
 */
export function drawEdgeTrim(scene) {
  const { ctx, vp, lanes, doc, palette, edgeTrim } = scene;
  if (!edgeTrim) return;
  for (const lane of lanes) {
    const clip = doc.tracks[lane.index].clips.find((each) => each.clipId === edgeTrim.clipId);
    if (!clip) continue;
    const atStart = edgeTrim.edge === 'start';
    const x = Math.round(timeToX(vp, atStart ? clip.timelineStart : clip.timelineEnd));
    const y = laneY(lane, vp.scrollY) + CLIP_INSET;
    const height = lane.height - 2 * CLIP_INSET;
    ctx.fillStyle = palette.snap;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(atStart ? x : x - 18, y, 18, height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.bg;
    bracket(ctx, x, y, height, atStart ? 1 : -1, 1);
    ctx.fillStyle = palette.snap;
    bracket(ctx, x, y, height, atStart ? 1 : -1, 0);
    return;
  }
}

/**
 * A ripple is on offer (F): for each of its steps an arrow under the
 * ruler, from where the following clips are to where they would go.
 * @param {Scene} scene
 */
export function drawPendingRipple(scene) {
  const { ctx, vp, palette, rippleSteps } = scene;
  if (!rippleSteps?.length) return;
  const y = RULER_H + 4;
  ctx.fillStyle = palette.snap;
  for (const { from, by } of rippleSteps) {
    const x0 = Math.round(timeToX(vp, from));
    const x1 = Math.round(timeToX(vp, from + by));
    if (Math.max(x0, x1) < 0 || Math.min(x0, x1) > vp.width) continue;
    const way = by < 0 ? -1 : 1;
    ctx.fillRect(Math.min(x0, x1), y - 1, Math.abs(x1 - x0), 2);
    ctx.fillRect(x0, RULER_H, 1, 9);
    ctx.beginPath();
    ctx.moveTo(x1 + way * 2, y);
    ctx.lineTo(x1 - way * 6, y - 5);
    ctx.lineTo(x1 - way * 6, y + 5);
    ctx.closePath();
    ctx.fill();
  }
}
