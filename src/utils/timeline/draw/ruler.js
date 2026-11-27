/**
 * Ruler layer: tick marks with timecode labels, the loop band along the
 * top edge and the marker flags. Marker lines through the lanes are drawn
 * here too, so everything about markers sits in one module.
 * @module utils/timeline/draw/ruler
 */

import { LOOP_BAND_H, RULER_H } from '#utils/timeline/layout.js';
import { timeToX } from '#utils/timeline/viewport.js';

/** @typedef {import('./scene.js').Scene} Scene */

const LABEL_FONT_PX = 10;
const FLAG_W = 9;

/**
 * The loop region on the band at the top of the ruler: solid while looping
 * is on, an outline of where it would loop while it is off.
 * @param {Scene} scene
 */
function drawLoopBand(scene) {
  const { ctx, vp, view, palette } = scene;
  if (!(view.loopEnd > view.loopStart)) return;
  const x0 = Math.max(-2, timeToX(vp, view.loopStart));
  const x1 = Math.min(vp.width + 2, timeToX(vp, view.loopEnd));
  if (x1 <= x0) return;
  ctx.fillStyle = view.loopEnabled ? palette.primary : palette.muted;
  ctx.globalAlpha = view.loopEnabled ? 0.9 : 0.45;
  ctx.fillRect(x0, 1, x1 - x0, LOOP_BAND_H - 3);
  ctx.globalAlpha = 1;
  ctx.fillRect(x0, 0, 2, LOOP_BAND_H);
  ctx.fillRect(x1 - 2, 0, 2, LOOP_BAND_H);
}

/**
 * Marker flags and labels in the ruler.
 * @param {Scene} scene
 */
function drawMarkerFlags(scene) {
  const { ctx, vp, doc, palette } = scene;
  ctx.font = `600 ${LABEL_FONT_PX}px ${palette.sans}`;
  ctx.textBaseline = 'middle';
  for (const marker of doc.markers || []) {
    const x = Math.round(timeToX(vp, marker.time));
    if (x < -200 || x > vp.width + FLAG_W) continue;
    const top = LOOP_BAND_H + 1;
    ctx.fillStyle = marker.color || palette.marker;
    ctx.fillRect(x, top, 1, RULER_H - top);
    const labelWidth = marker.label ? ctx.measureText(marker.label).width + 8 : FLAG_W;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + labelWidth, top);
    ctx.lineTo(x + labelWidth + 4, top + 5.5);
    ctx.lineTo(x + labelWidth, top + 11);
    ctx.lineTo(x, top + 11);
    ctx.closePath();
    ctx.fill();
    if (marker.label) {
      ctx.fillStyle = palette.clipText;
      ctx.fillText(marker.label, x + 4, top + 6);
    }
  }
}

/**
 * Draw the ruler over whatever scrolled under it.
 * @param {Scene} scene
 */
export function drawRuler(scene) {
  const { ctx, vp, palette } = scene;
  ctx.fillStyle = palette.ruler;
  ctx.fillRect(0, 0, vp.width, RULER_H);
  ctx.fillStyle = palette.grid;
  ctx.fillRect(0, LOOP_BAND_H - 1, vp.width, 1);
  ctx.fillRect(0, RULER_H - 1, vp.width, 1);

  ctx.font = `${LABEL_FONT_PX}px ${palette.mono}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = palette.muted;
  for (const tick of scene.ticks) {
    const x = Math.round(timeToX(vp, tick.time));
    const height = tick.major ? 8 : 4;
    ctx.fillRect(x, RULER_H - 1 - height, 1, height);
    if (tick.major) ctx.fillText(tick.label, x + 4, RULER_H - 4);
  }
  drawLoopBand(scene);
  drawMarkerFlags(scene);
}

/**
 * Dashed marker lines through the lanes.
 * @param {Scene} scene
 */
export function drawMarkerLines(scene) {
  const { ctx, vp, doc, palette } = scene;
  if (!doc.markers?.length) return;
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7;
  for (const marker of doc.markers) {
    const x = Math.round(timeToX(vp, marker.time)) + 0.5;
    if (x < 0 || x > vp.width) continue;
    ctx.strokeStyle = marker.color || palette.marker;
    ctx.beginPath();
    ctx.moveTo(x, RULER_H);
    ctx.lineTo(x, vp.height);
    ctx.stroke();
  }
  ctx.restore();
}
