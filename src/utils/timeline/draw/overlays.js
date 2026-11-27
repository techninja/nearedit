/**
 * Overlay layer: the time selection's shade, the edit cursor and playhead,
 * the snap guide, the marquee box and the drop target for media dragged in
 * from the bin.
 * @module utils/timeline/draw/overlays
 */

import { LOOP_BAND_H, RULER_H, laneY } from '#utils/timeline/layout.js';
import { timeToX } from '#utils/timeline/viewport.js';

/** @typedef {import('./scene.js').Scene} Scene */

/**
 * The time selection (which is the loop region) across the lanes: a shade
 * between two edge lines, stronger while looping is on.
 * @param {Scene} scene
 */
export function drawLoopShade(scene) {
  const { ctx, vp, view, palette } = scene;
  if (!(view.loopEnd > view.loopStart)) return;
  const x0 = Math.round(timeToX(vp, view.loopStart));
  const x1 = Math.round(timeToX(vp, view.loopEnd));
  if (x1 <= 0 || x0 >= vp.width) return;
  const height = vp.height - RULER_H;
  ctx.globalAlpha = view.loopEnabled ? 1 : 0.6;
  ctx.fillStyle = palette.loop;
  ctx.fillRect(Math.max(0, x0), RULER_H, Math.min(vp.width, x1) - Math.max(0, x0), height);
  ctx.globalAlpha = view.loopEnabled ? 0.9 : 0.55;
  ctx.fillStyle = palette.primary;
  ctx.fillRect(x0, RULER_H, 1, height);
  ctx.fillRect(x1 - 1, RULER_H, 1, height);
  ctx.globalAlpha = 1;
}

/**
 * A full-height line at a time, with a pointed head in the ruler.
 * @param {Scene} scene
 * @param {number} time
 * @param {string} color
 * @param {number} head - Half-width of the head; 0 for none
 */
function timeLine(scene, time, color, head) {
  const { ctx, vp } = scene;
  const x = Math.round(timeToX(vp, time));
  if (x < -head || x > vp.width + head) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, LOOP_BAND_H, 1, vp.height - LOOP_BAND_H);
  if (!head) return;
  ctx.beginPath();
  ctx.moveTo(x - head, LOOP_BAND_H);
  ctx.lineTo(x + head + 1, LOOP_BAND_H);
  ctx.lineTo(x + head + 1, LOOP_BAND_H + 6);
  ctx.lineTo(x + 0.5, LOOP_BAND_H + 6 + head);
  ctx.lineTo(x - head, LOOP_BAND_H + 6);
  ctx.closePath();
  ctx.fill();
}

/**
 * The edit cursor (where Stop returns to) and, over it, the playhead.
 * @param {Scene} scene
 */
export function drawTimeLines(scene) {
  const { view, palette, playhead } = scene;
  if (Math.abs(view.cursorPosition - playhead) > 1e-6) {
    timeLine(scene, view.cursorPosition, palette.cursor, 0);
  }
  timeLine(scene, playhead, palette.playhead, 5);
}

/**
 * The snap guide: where a dragged edge has locked on.
 * @param {Scene} scene
 */
export function drawGuide(scene) {
  const { ctx, vp, overlay, palette } = scene;
  if (overlay.guide === null) return;
  const x = Math.round(timeToX(vp, overlay.guide));
  ctx.fillStyle = palette.snap;
  ctx.fillRect(x - 1, 0, 2, vp.height);
}

/**
 * The marquee selection box.
 * @param {Scene} scene
 */
export function drawMarquee(scene) {
  const { ctx, overlay, palette } = scene;
  const box = overlay.marquee;
  if (!box) return;
  const x = Math.min(box.x0, box.x1);
  const y = Math.max(RULER_H, Math.min(box.y0, box.y1));
  const width = Math.abs(box.x1 - box.x0);
  const height = Math.max(box.y0, box.y1) - y;
  ctx.fillStyle = palette.selection;
  ctx.globalAlpha = 0.14;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.selection;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
}

/**
 * The clip an effect dragged from the Create tab would land on: outlined
 * and washed with the accent colour.
 * @param {Scene} scene
 * @param {string} clipId
 */
function drawDropClip(scene, clipId) {
  const { ctx, vp, lanes, doc, palette } = scene;
  for (const lane of lanes) {
    const clip = doc.tracks[lane.index].clips.find((candidate) => candidate.clipId === clipId);
    if (!clip) continue;
    const x = timeToX(vp, clip.timelineStart);
    const width = timeToX(vp, clip.timelineEnd) - x;
    const y = laneY(lane, vp.scrollY) + 2;
    ctx.fillStyle = palette.primary;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x, y, width, lane.height - 4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.primary;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, Math.max(0, width - 2), lane.height - 6);
  }
}

/**
 * Where a media item dragged from the bin would land: its lane lights up
 * and a bar marks the insert time.
 * @param {Scene} scene
 */
export function drawDropTarget(scene) {
  const { ctx, vp, lanes, overlay, palette } = scene;
  if (overlay.dropClipId) drawDropClip(scene, overlay.dropClipId);
  if (!overlay.drop) return;
  const x = Math.round(timeToX(vp, overlay.drop.time));
  const lane = lanes.find((candidate) => candidate.trackId === overlay.drop.trackId);
  const y = lane ? laneY(lane, vp.scrollY) : RULER_H;
  const height = lane ? lane.height : vp.height - RULER_H;
  ctx.fillStyle = palette.primary;
  ctx.globalAlpha = 0.16;
  ctx.fillRect(0, y, vp.width, height);
  ctx.globalAlpha = 0.35;
  ctx.fillRect(x, y + 2, 96, height - 4);
  ctx.globalAlpha = 1;
  ctx.fillRect(x - 1, y, 3, height);
}
