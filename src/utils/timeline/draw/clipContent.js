/**
 * What fills a clip's body: a filmstrip for pictures, a waveform for
 * sound, hatching (by intent) for placeholders. Only the visible part of a
 * clip is ever drawn.
 * @module utils/timeline/draw/clipContent
 */

import { INTENT_HATCH } from '#utils/timeline/palette.js';
import { filmstripTiles, stripColumns, waveColumns } from '#utils/timeline/peaks.js';
import { getStrip } from '#utils/timeline/thumbCache.js';
import { xToTimeRaw } from '#utils/timeline/viewport.js';
import { getWave } from '#utils/timeline/waveCache.js';
import { hatch } from './shapes.js';

/** @typedef {import('./scene.js').Scene} Scene */
/** @typedef {import('#utils/edl/types.js').Clip} Clip */
/** @typedef {{ x0: number, x1: number, y: number, height: number }} Box */

/**
 * Filmstrip of a video or image clip.
 * @param {Scene} scene
 * @param {Clip} clip
 * @param {boolean} still - An image clip
 * @param {Box} box - Area to fill; x0/x1 are the clip's true edges
 */
export function drawFilmstrip(scene, clip, still, box) {
  const { ctx, vp } = scene;
  const duration = still ? 0 : scene.durations[clip.sourceFile] || 0;
  const strip = getStrip(clip.sourceFile, stripColumns(duration, still));
  if (strip.state !== 'ready' || !strip.image) return;
  const cellWidth = strip.image.naturalWidth / strip.cols;
  const cellHeight = strip.image.naturalHeight;
  if (!(cellWidth > 0) || !(cellHeight > 0)) return;
  const tileWidth = Math.max(8, (box.height * cellWidth) / cellHeight);
  const left = Math.max(box.x0, 0);
  const right = Math.min(box.x1, vp.width);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, box.y, right - left, box.height);
  ctx.clip();
  const layout = { tileWidth, pps: vp.pps, duration, cols: strip.cols };
  for (const tile of filmstripTiles({ ...box, sourceIn: clip.sourceIn }, layout, vp.width)) {
    ctx.drawImage(
      strip.image,
      tile.cell * cellWidth,
      0,
      cellWidth,
      cellHeight,
      tile.x,
      box.y,
      tileWidth + 0.5,
      box.height,
    );
  }
  ctx.restore();
}

/**
 * Waveform of an audio clip, one bar per pixel column, scaled by the clip's
 * volume (up to full height).
 * @param {Scene} scene
 * @param {Clip} clip
 * @param {Box} box
 */
export function drawWaveform(scene, clip, box) {
  const { ctx, vp, palette } = scene;
  const entry = getWave(clip.sourceFile);
  if (entry.state !== 'ready' || !entry.wave) return;
  const left = Math.floor(Math.max(box.x0, 0));
  const count = Math.ceil(Math.min(box.x1, vp.width) - left);
  if (count <= 0) return;
  const sourceAt = clip.sourceIn + (xToTimeRaw(vp, left) - clip.timelineStart);
  const columns = waveColumns(entry.wave, sourceAt, 1 / vp.pps, count);
  const middle = box.y + box.height / 2;
  const reach = (box.height / 2 - 1) * Math.min(1, Math.max(0, clip.volume ?? 1));
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const half = Math.max(0.5, columns[i] * reach);
    ctx.rect(left + i, middle - half, 1, half * 2);
  }
  ctx.fillStyle = palette.clipText;
  ctx.globalAlpha = 0.72;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Hatching of a placeholder; colour and slant tell the intent apart.
 * @param {Scene} scene
 * @param {Clip} clip
 * @param {Box} box
 */
export function drawPlaceholder(scene, clip, box) {
  const { ctx, vp, palette } = scene;
  const style = INTENT_HATCH[clip.intent] || { color: 'clipText', slant: 1 };
  const left = Math.max(box.x0, -16);
  const right = Math.min(box.x1, vp.width + 16);
  ctx.strokeStyle = palette[style.color];
  ctx.lineWidth = 2;
  ctx.globalAlpha = INTENT_HATCH[clip.intent] ? 0.85 : 0.3;
  // Anchor the pattern to the clip's own edge so it does not swim on scroll.
  const anchored = box.x0 + Math.floor((left - box.x0) / 9) * 9;
  hatch(ctx, anchored, box.y, right - anchored, box.height, 9, style.slant);
  ctx.globalAlpha = 1;
}
