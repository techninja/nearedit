/**
 * Lane layer: track backgrounds, the grid lines under the ruler's labelled
 * ticks, the video/audio divider and the hatching of locked tracks.
 * @module utils/timeline/draw/lanes
 */

import { RULER_H, laneY, lanesHeight } from '#utils/timeline/layout.js';
import { timeToX } from '#utils/timeline/viewport.js';
import { hatch } from './shapes.js';

/** @typedef {import('./scene.js').Scene} Scene */

/**
 * Draw the lane backgrounds and the time grid.
 * @param {Scene} scene
 */
export function drawLanes(scene) {
  const { ctx, vp, lanes, doc, palette, view } = scene;
  for (const lane of lanes) {
    const y = laneY(lane, vp.scrollY);
    if (y > vp.height || y + lane.height < RULER_H) continue;
    const track = doc.tracks[lane.index];
    ctx.fillStyle = lane.index % 2 ? palette.laneAlt : palette.lane;
    ctx.fillRect(0, y, vp.width, lane.height);
    if (track.trackId === view.activeTrackId) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = palette.primary;
      ctx.fillRect(0, y, 2, lane.height);
      ctx.globalAlpha = 1;
    }
    if (track.locked) {
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      hatch(ctx, 0, y, vp.width, lane.height, 10);
    }
  }

  const bottom = Math.min(vp.height, RULER_H + lanesHeight(lanes) - vp.scrollY);
  ctx.fillStyle = palette.grid;
  ctx.globalAlpha = 0.45;
  for (const tick of scene.ticks) {
    if (tick.major) ctx.fillRect(Math.round(timeToX(vp, tick.time)), RULER_H, 1, bottom - RULER_H);
  }
  ctx.globalAlpha = 1;

  // A firmer line where the audio tracks begin.
  const firstAudio = lanes.find((lane) => lane.type === 'audio');
  if (firstAudio && firstAudio.index > 0) {
    ctx.fillRect(0, laneY(firstAudio, vp.scrollY) - 1, vp.width, 2);
  }
}

/**
 * Wash a lane with its own background colour, dimming the clips of a muted
 * or locked track.
 * @param {Scene} scene
 * @param {import('#utils/timeline/layout.js').Lane} lane
 * @param {number} strength - 0..1
 */
export function dimLane(scene, lane, strength) {
  const { ctx, vp, palette } = scene;
  ctx.globalAlpha = strength;
  ctx.fillStyle = lane.index % 2 ? palette.laneAlt : palette.lane;
  ctx.fillRect(0, laneY(lane, vp.scrollY), vp.width, lane.height);
  ctx.globalAlpha = 1;
}
