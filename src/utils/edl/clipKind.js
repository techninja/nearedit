/**
 * What kind of thing a clip is. Isomorphic and pure.
 * @module utils/edl/clipKind
 */

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const AUDIO_EXTS = ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a'];

/**
 * Classify a clip. A clip that names a generator is a generator whatever
 * else it carries; without a source file it is a title when it has text and
 * a placeholder otherwise.
 * @param {object} clip
 * @param {object} [track] - Owning track, used to tell audio from video
 * @returns {'generator'|'title'|'placeholder'|'image'|'audio'|'video'}
 */
export function clipKind(clip, track) {
  if (clip.generator?.type) return 'generator';
  if (!clip.sourceFile) return clip.text?.content ? 'title' : 'placeholder';
  const ext = clip.sourceFile.split('.').pop().toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (track?.type === 'audio' || AUDIO_EXTS.includes(ext)) return 'audio';
  return 'video';
}
