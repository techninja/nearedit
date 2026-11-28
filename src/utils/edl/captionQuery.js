/**
 * Captions as an editor reads them: which clips can have them, which have
 * them switched on, where a voice keeps its block, and which captioned
 * clips have no words to show. A picture clip and the sound clip it is
 * linked to are one voice (`captionVoices` draws them as one); the sound
 * clip is where edits write the block. Isomorphic and pure.
 * Contract: docs/app-spec/CAPTIONS.md § In the document.
 * @module utils/edl/captionQuery
 */

import { captionVoices } from '#utils/captions/voices.js';
import { indexClips, isTimed } from './immutable.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {import('./types.js').ClipRef} ClipRef */

/**
 * A voice as edits see it.
 * @typedef {Object} VoiceRef
 * @property {Clip} clip - The clip that carries the voice's captions: the
 *   sound clip of a linked pair, otherwise the clip itself
 * @property {Track} track - Its track
 * @property {ClipRef|null} other - The linked picture of a pair
 * @property {boolean} on - Captions are switched on for the voice
 * @property {import('#utils/captions/types.js').Word[]} [words] - The
 *   voice's own words, when it has any
 */

/**
 * What an inspector shows for one clip.
 * @typedef {Object} CaptionInfo
 * @property {boolean} can - The clip can have captions at all
 * @property {boolean} on - They are switched on (for the clip or its linked partner)
 * @property {string} carrierId - The clip that holds the block: this one or
 *   its linked sound clip; '' when the clip cannot have captions
 * @property {number} ownWords - Words written on the voice itself; 0 = the
 *   transcript of `file` is shown
 * @property {string} file - The file whose transcript is shown; '' when
 *   the voice carries its own words
 * @property {boolean} heard - Its captions are drawn: on, and its track
 *   sounds (mute and solo count)
 */

/**
 * Whether a clip can have captions: it plays video or sound (footage, a
 * sound file, a web or a music clip). Titles, generators, stills, elements
 * and placeholders cannot.
 * @param {Clip} clip
 * @param {Track} [track]
 * @returns {boolean}
 */
export function canCaption(clip, track) {
  return Boolean(clip) && isTimed(clip, track);
}

/**
 * The voice a clip belongs to.
 * @param {Map<string, ClipRef>} index - `indexClips(edl)`
 * @param {string} clipId
 * @returns {VoiceRef|null} null for an unknown clip and one that cannot have captions
 */
export function voiceRef(index, clipId) {
  const ref = index.get(clipId);
  if (!ref || !canCaption(ref.clip, ref.track)) return null;
  const partner = index.get(ref.clip.linkedClipId);
  const paired =
    partner && partner.track.type !== ref.track.type && canCaption(partner.clip, partner.track);
  if (!paired) {
    const block = ref.clip.captions;
    return { ...ref, other: null, on: block?.on === true, words: block?.words };
  }
  const [sound, picture] = ref.track.type === 'audio' ? [ref, partner] : [partner, ref];
  const [heard, seen] = [sound.clip.captions, picture.clip.captions];
  // As `captionVoices` reads a pair: the sound clip's block when it is on,
  // else the picture's; switched off, whichever holds words.
  const shown = heard?.on ? heard : seen?.on ? seen : (heard ?? seen);
  const on = heard?.on === true || seen?.on === true;
  return { ...sound, other: picture, on, words: shown?.words };
}

/**
 * @param {Edl} edl
 * @returns {VoiceRef[]} The voices that are switched on, each once, in track order
 */
function voicesOn(edl) {
  const index = indexClips(edl);
  /** @type {Map<Clip, VoiceRef>} */
  const found = new Map();
  for (const { clip } of index.values()) {
    if (clip.captions?.on !== true) continue;
    const voice = voiceRef(index, clip.clipId);
    if (voice && !found.has(voice.clip)) found.set(voice.clip, voice);
  }
  return [...found.values()];
}

/**
 * The clips whose captions are switched on — muted or not — each voice
 * once, as the clip that carries it.
 * @param {Edl} edl
 * @returns {ClipRef[]}
 */
export function captionedClips(edl) {
  return voicesOn(edl).map(({ clip, track }) => ({ clip, track }));
}

/**
 * The captioned clips that have nothing to show: no words of their own and
 * no transcript of their file.
 * @param {Edl} edl
 * @param {(clip: Clip) => boolean} hasWords - Whether there is a
 *   transcript for the clip's file
 * @returns {ClipRef[]}
 */
export function captionsWithoutWords(edl, hasWords) {
  return voicesOn(edl)
    .filter(({ clip, words }) => !words && !(clip.sourceFile && hasWords(clip) === true))
    .map(({ clip, track }) => ({ clip, track }));
}

/**
 * The state of one clip's captions, for an inspector.
 * @param {Edl} edl
 * @param {string} clipId
 * @returns {CaptionInfo}
 */
export function captionInfo(edl, clipId) {
  const voice = voiceRef(indexClips(edl), clipId);
  if (!voice) return { can: false, on: false, carrierId: '', ownWords: 0, file: '', heard: false };
  const ownWords = voice.words?.length || 0;
  return {
    can: true,
    on: voice.on,
    carrierId: voice.clip.clipId,
    ownWords,
    file: ownWords ? '' : voice.clip.sourceFile,
    heard: voice.on && captionVoices(edl).some(({ pieces }) => pieces.includes(voice.clip)),
  };
}
