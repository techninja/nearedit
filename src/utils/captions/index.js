/**
 * Captions — words on screen as they are spoken. The style as data, the
 * grouping of words, what is on screen at an instant, its layout and its
 * drawing on a Canvas 2D context, and subtitle files from the same groups.
 * Isomorphic: the browser preview and the server render load these modules.
 * Contract: docs/app-spec/CAPTIONS.md.
 * @module utils/captions
 */

export { TIME_GIVE, captionAt } from './at.js';
export { SUBTITLE_GROUP, formatSrt, formatTimestamp, formatVtt, timelineCues } from './cues.js';
export { drawCaption } from './draw.js';
export { captionFont, captionFontNeed, drawCaptionAt } from './drawAt.js';
export { SAFE, reachOf, unitOf } from './metrics.js';
export { captionGroups } from './groups.js';
export { layoutCaption } from './layout.js';
export { CAPTION_PRESETS } from './presets.js';
export { flatCaptionStyle, normalizeCaptionStyle, resolveCaptionStyle } from './resolve.js';
export {
  ANCHORS,
  CAPTION_STYLE,
  CASES,
  GROUP_MOTIONS,
  HIGHLIGHTS,
  PRESET_NAMES,
  STYLE_PATHS,
  UNSPOKEN,
  WORD_MOTIONS,
} from './style.js';
export { wordsFromTranscript } from './transcript.js';
export { captionVoices, voiceWords, voicesAt } from './voices.js';
export { MAX_WORDS, MAX_WORD_CHARS, normalizeCaptions, repairWords } from './words.js';
