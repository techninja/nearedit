/**
 * Marks the keyboard leaves on the canvas: the edge chosen in edge-trim
 * mode, and the arrow that shows what a post-edit ripple (F) would do.
 * @module utils/timeline/draw/marks
 */

import { CLIP_INSET, RULER_H, laneY } from '#utils/timeline/layout.js';
import { timeToX } from '#utils/timeline/viewport.js';

/** @typedef {import('./scene.js').Scene} Scene */

/**
 * Edge-trim mode: a bracket in the snap colour on the chosen edge, and a
 * glow on the clip's side of it, so it reads at any zoom.
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
    const into = atStart ? 1 : -1;
    ctx.fillStyle = palette.snap;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(atStart ? x : x - 14, y, 14, height);
    ctx.globalAlpha = 1;
    ctx.fillRect(atStart ? x - 1 : x - 2, y - 2, 3, height + 4);
    ctx.fillRect(atStart ? x : x - 8, y - 2, 8, 3);
    ctx.fillRect(atStart ? x : x - 8, y + height - 1, 8, 3);
    // A small arrowhead pointing into the clip, where the trim keys pull from.
    ctx.beginPath();
    ctx.moveTo(x + into * 5, y + height / 2 - 5);
    ctx.lineTo(x + into * 11, y + height / 2);
    ctx.lineTo(x + into * 5, y + height / 2 + 5);
    ctx.closePath();
    ctx.fill();
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
