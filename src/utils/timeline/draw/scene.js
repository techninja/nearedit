/**
 * One frame of the timeline canvas, drawn back to front in layers: lanes,
 * clips, lane overlays (loop shade, marker lines), then the ruler and the
 * lines that cross everything (cursor, playhead, snap guide, marquee).
 * Each layer lives in its own module and draws only what is visible.
 * @module utils/timeline/draw/scene
 */

import { RULER_H } from '#utils/timeline/layout.js';
import { rulerTicks } from '#utils/timeline/ticks.js';
import { visibleTimes } from '#utils/timeline/viewport.js';
import { drawClips } from './clips.js';
import { drawLanes } from './lanes.js';
import {
  drawDropTarget,
  drawGuide,
  drawLoopShade,
  drawMarquee,
  drawTimeLines,
} from './overlays.js';
import { drawMarkerLines, drawRuler } from './ruler.js';

/**
 * Transient things drawn over the document while the pointer is at work.
 * @typedef {Object} Overlay
 * @property {number|null} guide - Time of the snap guide line
 * @property {{ x0: number, y0: number, x1: number, y1: number }|null} marquee - Canvas pixels
 * @property {{ time: number, trackId: string }|null} drop - Where a dragged media item would land
 * @property {string} hoverClipId - Clip under the pointer (shows its handles)
 */

/**
 * Everything a layer needs to draw.
 * @typedef {Object} Scene
 * @property {CanvasRenderingContext2D} ctx - Already scaled to CSS pixels
 * @property {import('#utils/timeline/viewport.js').Viewport} vp
 * @property {import('#utils/timeline/layout.js').Lane[]} lanes
 * @property {import('#utils/edl/types.js').Edl} doc
 * @property {import('#store/ViewState.js').ViewStateShape} view
 * @property {import('#utils/timeline/palette.js').Palette} palette
 * @property {Set<string>} selected - Selected clip ids
 * @property {number} playhead - Seconds
 * @property {Overlay} overlay
 * @property {Record<string, number>} durations - Source durations by path
 * @property {boolean} coarse - Finger-sized handles
 * @property {import('#utils/timeline/ticks.js').Tick[]} [ticks] - Filled in by `drawScene`
 */

/** @returns {Overlay} An overlay with nothing on it */
export function emptyOverlay() {
  return { guide: null, marquee: null, drop: null, hoverClipId: '' };
}

/**
 * Draw one frame.
 * @param {Scene} scene
 */
export function drawScene(scene) {
  const { ctx, vp, palette } = scene;
  const { start, end } = visibleTimes(vp);
  scene.ticks = rulerTicks(start, end, vp.pps, scene.doc.fps);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, vp.width, vp.height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, RULER_H, vp.width, Math.max(0, vp.height - RULER_H));
  ctx.clip();
  drawLanes(scene);
  drawClips(scene);
  drawLoopShade(scene);
  drawMarkerLines(scene);
  drawDropTarget(scene);
  ctx.restore();

  drawRuler(scene);
  drawTimeLines(scene);
  drawGuide(scene);
  drawMarquee(scene);
}
