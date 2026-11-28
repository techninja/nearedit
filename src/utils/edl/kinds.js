/**
 * The part of the EDL library's public surface that belongs to clips of a
 * special kind — web clips, music clips, brand elements — and to captions
 * and the person cutout.
 * Re-exported whole by `index.js`; import from there.
 * @module utils/edl/kinds
 */

export {
  insertWebClip,
  setWebRecording,
  staleWebClips,
  updateWebRecipe,
  webClips,
} from './webClip.js';
export { applyWebZoom, clearWebZoom } from './webZoom.js';
export { isStale, isWebClip, stepMarks, webDuration } from '#utils/web/clip.js';
export {
  insertMusicClip,
  musicClips,
  setMusicRendering,
  staleMusicClips,
  updateSong,
} from './musicClip.js';
export { isMusicClip, isStaleMusic, musicDuration } from '#utils/music/clip.js';
export {
  elementClips,
  insertElement,
  restyle,
  staleElements,
  updateElementSlots,
} from './elementClip.js';
export { detachElement } from './elementDetach.js';
export { syncFonts } from './elementFonts.js';
export { elementSpan, isElementClip } from '#utils/brand/clip.js';

// Captions: a clip's switch and words, the timeline's style, and what an editor reads
export { captionAllSpeech, setCaptionWords, setCaptions } from './captions.js';
export { patchCaptionStyle, setCaptionStyle } from './captionStyle.js';
export { canCaption, captionInfo, captionedClips, captionsWithoutWords } from './captionQuery.js';
export { captionVoices, voiceFiles, voicesAt } from '#utils/captions/voices.js';

// The person cutout: a clip's switch and settings, the file made for it, what is still to make
export { attachCutout, canCutout, cutoutNeeds, setCutout } from './cutout.js';
export { cutoutState } from '#utils/cutout/made.js';
