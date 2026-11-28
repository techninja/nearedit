/**
 * What the timeline draws on a web clip: until it is recorded, hatching
 * and its address (a placeholder with a length); a mark at the right of
 * the label strip while it needs recording; and a tick where each step
 * begins, with the step's label when there is room for it.
 * @module utils/timeline/draw/webClip
 */

import { TICK_LABEL_ROOM, webMark, webTicks } from '#utils/timeline/clipMarksWeb.js';
import { timeToX } from '#utils/timeline/viewport.js';
import { fitText, hatch } from './shapes.js';

/** @typedef {import('./scene.js').Scene} Scene */
/** @typedef {{ x0: number, x1: number, y: number, height: number }} ClipBox */

/** Height of the label strip the ticks sit under. */
const LABEL_H = 15;
/** Height of the band the ticks and their labels are drawn in. */
export const TICK_BAND = 12;
const MARKS = { stale: 'out of date', unrecorded: 'not recorded' };
const MARK_PAD = 5;

/**
 * The body of a web clip that has no recording yet: light hatching and
 * the address, so it reads as a place being kept for a page.
 * @param {Scene} scene
 * @param {any} clip
 * @param {ClipBox} box
 */
export function drawWebPlaceholder(scene, clip, box) {
  const { ctx, vp, palette } = scene;
  const left = Math.max(box.x0, -16);
  const right = Math.min(box.x1, vp.width + 16);
  ctx.strokeStyle = palette.clipText;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.22;
  const anchored = box.x0 + Math.floor((left - box.x0) / 9) * 9;
  hatch(ctx, anchored, box.y, right - anchored, box.height, 9, -1);
  ctx.globalAlpha = 1;
  const top = box.y + LABEL_H + TICK_BAND;
  const room = Math.min(box.x1, vp.width) - Math.max(box.x0, 0) - 10;
  if (box.y + box.height - top < 12 || room < 40) return;
  ctx.font = `10px ${palette.mono}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.clipText;
  ctx.globalAlpha = 0.8;
  const address = clip.web.recipe.url.replace(/^https?:\/\//, '');
  ctx.fillText(fitText(ctx, address, room), Math.max(box.x0, 0) + 5, top + 7);
  ctx.globalAlpha = 1;
}

/**
 * The mark of a web clip that needs recording, at the right end of the
 * label strip: its words when they fit, else a dot.
 * @param {Scene} scene
 * @param {any} clip
 * @param {ClipBox} box
 * @param {number} taken - Pixels at the right end already used (the "fx" badge)
 * @returns {number} Pixels the mark takes from the label's room; 0 = none drawn
 */
export function drawWebMark(scene, clip, box, taken) {
  const mark = webMark(clip, scene.doc.fps);
  const width = box.x1 - box.x0;
  if (!mark || width < 26) return 0;
  const { ctx, palette, vp } = scene;
  ctx.font = `bold 9px ${palette.sans}`;
  const text = MARKS[mark];
  const wide = width >= 150 ? Math.ceil(ctx.measureText(text).width) + 2 * MARK_PAD : 11;
  const x = Math.min(box.x1, vp.width + 8) - taken - wide - 3;
  ctx.fillStyle = mark === 'stale' ? palette.warning : 'rgb(0 0 0 / 40%)';
  ctx.beginPath();
  ctx.roundRect(x, box.y + 2, wide, 11, wide > 11 ? 3 : 5.5);
  ctx.fill();
  if (wide > 11) {
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.clipText;
    ctx.fillText(text, x + MARK_PAD, box.y + 8);
  }
  return wide + 5;
}

/**
 * A tick where each step of a web clip begins, under the label strip.
 * @param {Scene} scene
 * @param {any} clip
 * @param {ClipBox} box
 */
export function drawStepTicks(scene, clip, box) {
  const { ctx, vp, palette } = scene;
  const top = box.y + LABEL_H;
  if (box.height < LABEL_H + TICK_BAND) return;
  const ticks = webTicks(clip, scene.doc.fps, vp.pps);
  if (!ticks.length) return;
  const left = Math.max(box.x0, 0);
  ctx.fillStyle = 'rgb(0 0 0 / 38%)';
  ctx.fillRect(left, top, Math.min(box.x1, vp.width) - left, TICK_BAND);
  ctx.font = `9px ${palette.sans}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.clipText;
  for (const tick of ticks) {
    const x = timeToX(vp, tick.time);
    if (x > vp.width + 2 || x + tick.room < -2) continue;
    ctx.fillRect(Math.round(x), top, 1.5, TICK_BAND);
    if (tick.room < TICK_LABEL_ROOM) continue;
    const from = Math.max(x, 0) + 4;
    const text = fitText(ctx, `${tick.index + 1} ${tick.label}`, x + tick.room - from - 3);
    if (text) ctx.fillText(text, from, top + TICK_BAND / 2 + 0.5);
  }
}
