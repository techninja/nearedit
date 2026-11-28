/**
 * One clip: coloured body, content (filmstrip / waveform / hatching / a
 * generator's colours / a song's picture), label, the "fx" badge and keyframe marks,
 * deliberate fade ramps, fade handles and the selection outline.
 * Detail drops away as the clip gets narrower, so a zoomed-out timeline of
 * a thousand slivers costs a thousand rectangles.
 * @module utils/timeline/draw/clipBody
 */

import { clipKind } from '#utils/edl/factory.js';
import { generatorLabel } from '#utils/timeline/clipMarks.js';
import { musicLabel } from '#utils/timeline/clipMarksMusic.js';
import { webLabel } from '#utils/timeline/clipMarksWeb.js';
import { hitSizes } from '#utils/timeline/hitTest.js';
import { timeToX } from '#utils/timeline/viewport.js';
import { edgeOverlaps } from '#utils/timeline/visible.js';
import { isMusicClip } from '#utils/music/clip.js';
import { isWebClip } from '#utils/web/clip.js';
import { drawFilmstrip, drawPlaceholder, drawWaveform } from './clipContent.js';
import {
  BADGE_W,
  drawEffectBadge,
  drawGeneratorSwatch,
  drawKeyMarks,
  showsBadge,
} from './clipMarks.js';
import { drawFadeHandle, drawFadeRamp } from './fades.js';
import { drawMusicBody, drawMusicMark } from './musicClip.js';
import { boxPath, fitText } from './shapes.js';
import { drawStepTicks, drawWebMark, drawWebPlaceholder } from './webClip.js';

/** @typedef {import('./scene.js').Scene} Scene */

/** Height of the label strip on top of picture clips. */
const LABEL_H = 15;
/** Narrower than this a clip is a plain rectangle. */
const DETAIL_MIN = 10;
/** A filmstrip shorter than this is not worth drawing. */
const MIN_STRIP_H = 8;
/** Narrower than this a clip has no label. */
const LABEL_MIN = 30;

/**
 * @param {import('#utils/edl/types.js').Clip} clip
 * @returns {string} The name shown on the clip
 */
export function clipLabel(clip) {
  if (isWebClip(clip)) return webLabel(clip);
  if (isMusicClip(clip)) return musicLabel(clip);
  if (clip.label) return clip.label;
  if (clip.sourceFile) return clip.sourceFile.split(/[\\/]/).pop();
  if (clip.generator?.type) return generatorLabel(clip.generator);
  return clip.text?.content?.split('\n')[0] || clip.prompt || clip.intent || 'Placeholder';
}

/**
 * The colour of a clip's body.
 * @param {Scene} scene
 * @param {import('#utils/edl/types.js').Clip} clip
 * @param {import('#utils/edl/types.js').Track} track
 * @returns {string}
 */
export function clipColor(scene, clip, track) {
  const kind = isWebClip(clip) ? 'web' : isMusicClip(clip) ? 'music' : clipKind(clip, track);
  return clip.color || scene.palette[kind];
}

/**
 * Draw one clip of a track.
 * @param {Scene} scene
 * @param {import('#utils/edl/types.js').Track} track
 * @param {number} index - Index of the clip in `track.clips`
 * @param {{ y: number, height: number }} lane - Vertical extent of the clip
 */
export function drawClip(scene, track, index, lane) {
  const { ctx, vp, palette } = scene;
  const clip = track.clips[index];
  const x0 = timeToX(vp, clip.timelineStart);
  const x1 = timeToX(vp, clip.timelineEnd);
  const width = x1 - x0;
  const left = Math.max(x0, -8);
  const right = Math.min(Math.max(x1, x0 + 1.5), vp.width + 8);
  const kind = clipKind(clip, track);
  const web = isWebClip(clip);
  const music = isMusicClip(clip);
  const selected = scene.selected.has(clip.clipId);
  const { y, height } = lane;

  ctx.fillStyle = clipColor(scene, clip, track);
  boxPath(ctx, left, y, right - left, height, width > 8 ? 3 : 0);
  ctx.fill();

  if (width >= DETAIL_MIN) {
    const box = { x0, x1, y, height };
    // A minimised lane has room for the label strip only.
    if ((kind === 'video' || kind === 'image') && height - LABEL_H >= MIN_STRIP_H) {
      drawFilmstrip(scene, clip, kind === 'image', {
        ...box,
        y: y + LABEL_H,
        height: height - LABEL_H,
      });
    } else if (music) drawMusicBody(scene, clip, box, kind === 'audio');
    else if (kind === 'audio') drawWaveform(scene, clip, box);
    else if (web && kind === 'placeholder') drawWebPlaceholder(scene, clip, box);
    else if (kind === 'placeholder') drawPlaceholder(scene, clip, box);
    else if (kind === 'generator') drawGeneratorSwatch(scene, clip, box, y + LABEL_H + 1);
  }
  const overlaps = edgeOverlaps(track.clips, index);
  // The label starts after a cross-fade, where the outgoing clip still shows.
  const labelFrom = Math.max(x0 + overlaps.in * vp.pps, 0) + 5;
  const badge = showsBadge(clip, { x0, x1, y, height });
  if (web && width >= DETAIL_MIN) drawStepTicks(scene, clip, { x0, x1, y, height });
  const marker = web ? drawWebMark : music ? drawMusicMark : () => 0;
  const mark = marker(scene, clip, { x0, x1, y, height }, badge ? BADGE_W : 0);
  const labelRoom = x1 - labelFrom - (badge ? BADGE_W : 0) - mark;
  if (labelRoom >= LABEL_MIN) {
    ctx.font = `11px ${palette.sans}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.clipText;
    ctx.fillText(fitText(ctx, clipLabel(clip), labelRoom - 5), labelFrom, y + LABEL_H / 2 + 0.5);
  }
  if (badge) drawEffectBadge(scene, { x0, x1, y, height });
  drawKeyMarks(scene, clip, { x0, x1, y, height });
  const { fadeInCurve, fadeOutCurve } = /** @type {any} */ (clip);
  const ramp = (edge, x, length, curve) =>
    drawFadeRamp(ctx, edge, x, y, height, length, palette, curve);
  if (!(overlaps.in > 0)) ramp('in', x0, clip.fadeIn * vp.pps, fadeInCurve);
  if (!(overlaps.out > 0)) ramp('out', x1, clip.fadeOut * vp.pps, fadeOutCurve);

  if (selected) {
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 2;
    boxPath(ctx, left + 1, y + 1, Math.max(0, right - left - 2), height - 2, width > 8 ? 2 : 0);
    ctx.stroke();
  }
  const handles = selected || scene.overlay.hoverClipId === clip.clipId;
  if (handles && width >= hitSizes(scene.coarse).minFadeWidth) {
    const size = scene.coarse ? 11 : 7;
    if (!(overlaps.in > 0)) drawFadeHandle(ctx, x0 + clip.fadeIn * vp.pps, y, palette, size);
    if (!(overlaps.out > 0)) drawFadeHandle(ctx, x1 - clip.fadeOut * vp.pps, y, palette, size);
  }
}
