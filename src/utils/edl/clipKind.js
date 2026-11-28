/**
 * What kind of thing a clip is. Isomorphic and pure.
 * @module utils/edl/clipKind
 */

import { isElementClip } from '#utils/brand/clip.js';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const AUDIO_EXTS = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'];

/**
 * Classify a clip. A clip that carries a brand element (an `element` block
 * with a design) is an element, and one that names a generator a generator,
 * whatever else they carry; without a source file a clip is a title when it
 * has text and a placeholder otherwise.
 * @param {object} clip
 * @param {object} [track] - Owning track, used to tell audio from video
 * @returns {'generator'|'title'|'placeholder'|'image'|'audio'|'video'} One
 *   of these — or `'element'`, which the declared type leaves out until the
 *   code that still types the six older kinds (the inspector, playback
 *   cues) has a case for it
 */
export function clipKind(clip, track) {
  if (isElementClip(clip)) return /** @type {any} */ ('element');
  if (clip.generator?.type) return 'generator';
  if (!clip.sourceFile) return clip.text?.content ? 'title' : 'placeholder';
  const ext = clip.sourceFile.split('.').pop().toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (track?.type === 'audio' || AUDIO_EXTS.includes(ext)) return 'audio';
  return 'video';
}
