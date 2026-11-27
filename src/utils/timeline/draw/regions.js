/**
 * Regions on the timeline: in the ruler a band between two tags — the
 * start tag carries the name, the end tag closes it — and through the
 * lanes a faint line at each end. Drawn in the region colour of the theme
 * unless the region has its own.
 * @module utils/timeline/draw/regions
 */

import { LOOP_BAND_H, MARK_ROW_H, RULER_H } from '#utils/timeline/layout.js';
import { timeToX } from '#utils/timeline/viewport.js';
import { fitText } from './shapes.js';

/** @typedef {import('./scene.js').Scene} Scene */

/** Width of the tag that opens a region, and of the one that closes it. */
const TAG_W = 7;
const END_TAG_W = 4;
const LABEL_FONT_PX = 10;

/**
 * The regions that reach into the view, with their x extents.
 * @param {Scene} scene
 * @returns {{ region: any, x0: number, x1: number }[]}
 */
function visibleRegions(scene) {
  const regions = /** @type {any} */ (scene.doc).regions || [];
  return regions
    .map((region) => ({
      region,
      x0: timeToX(scene.vp, region.start),
      x1: timeToX(scene.vp, region.end),
    }))
    .filter(({ x0, x1 }) => x1 >= -TAG_W && x0 <= scene.vp.width + TAG_W);
}

/**
 * Region bands and tags in the ruler's row of marks.
 * @param {Scene} scene
 */
export function drawRegionTags(scene) {
  const { ctx, palette } = scene;
  const top = LOOP_BAND_H + 1;
  const height = MARK_ROW_H - 1;
  ctx.font = `600 ${LABEL_FONT_PX}px ${palette.sans}`;
  ctx.textBaseline = 'middle';
  for (const { region, x0, x1 } of visibleRegions(scene)) {
    const left = Math.round(x0);
    const right = Math.round(x1);
    ctx.fillStyle = region.color || palette.region;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(left, top, right - left, height);
    ctx.globalAlpha = 1;
    // A line down to the ticks at each end, a tag on the inside of each.
    ctx.fillRect(left, top, 1, RULER_H - top);
    ctx.fillRect(right - 1, top, 1, RULER_H - top);
    ctx.fillRect(left, top, Math.min(TAG_W, right - left), height);
    ctx.fillRect(Math.max(left, right - END_TAG_W), top, Math.min(END_TAG_W, right - left), height);
    const room = right - left - TAG_W - 8;
    const label = region.label && room > 12 ? fitText(ctx, region.label, room) : '';
    if (!label) continue;
    ctx.fillStyle = palette.text;
    ctx.fillText(label, Math.max(left, 0) + TAG_W + 4, top + height / 2 + 0.5);
  }
}

/**
 * A line through the lanes at each end of every region.
 * @param {Scene} scene
 */
export function drawRegionLines(scene) {
  const { ctx, vp, palette } = scene;
  ctx.globalAlpha = 0.55;
  for (const { region, x0, x1 } of visibleRegions(scene)) {
    ctx.fillStyle = region.color || palette.region;
    for (const x of [Math.round(x0), Math.round(x1) - 1]) {
      if (x >= 0 && x <= vp.width) ctx.fillRect(x, RULER_H, 1, vp.height - RULER_H);
    }
  }
  ctx.globalAlpha = 1;
}
