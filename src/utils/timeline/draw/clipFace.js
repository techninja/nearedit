/**
 * The face of a clip in the timeline: the name written on it and the colour
 * of its body, by what kind of clip it is.
 * @module utils/timeline/draw/clipFace
 */

import { isElementClip } from '#utils/brand/clip.js';
import { clipKind } from '#utils/edl/factory.js';
import { isMusicClip } from '#utils/music/clip.js';
import { generatorLabel } from '#utils/timeline/clipMarks.js';
import { musicLabel } from '#utils/timeline/clipMarksMusic.js';
import { webLabel } from '#utils/timeline/clipMarksWeb.js';
import { isWebClip } from '#utils/web/clip.js';
import { elementLabel } from './elementClip.js';

/** @typedef {import('./scene.js').Scene} Scene */

/**
 * @param {import('#utils/edl/types.js').Clip} clip
 * @returns {string} The name shown on the clip
 */
export function clipLabel(clip) {
  if (isWebClip(clip)) return webLabel(clip);
  if (isMusicClip(clip)) return musicLabel(clip);
  if (isElementClip(clip)) return elementLabel(clip);
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
