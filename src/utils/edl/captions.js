/**
 * Captions as edits: switching them on for clips and giving a clip words
 * of its own. A clip and its linked partner on the other kind of track are
 * one voice — the sound clip carries the `captions` block, whichever of
 * the two is named. The timeline's style is captionStyle.js.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md.
 * @module utils/edl/captions
 */

import { normalizeCaptions } from '#utils/captions/words.js';
import { isMusicClip } from '#utils/music/clip.js';
import { voiceRef } from './captionQuery.js';
import { idList, indexClips, mapClips } from './immutable.js';
import { sameJson } from './jsonBag.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('#utils/captions/types.js').CaptionsBlock} CaptionsBlock */

/**
 * A clip with a `captions` block, or without one when there is nothing to
 * keep (captions off and no words).
 * @param {Clip} clip
 * @param {CaptionsBlock} block
 * @returns {Clip} The clip itself when it already holds exactly that
 */
function withBlock(clip, { on, words }) {
  const had = clip.captions;
  if (!on && !words) {
    if (had === undefined) return clip;
    const { captions: _dropped, ...rest } = clip;
    return /** @type {Clip} */ (rest);
  }
  if (had && had.on === on && had.words === words && Object.keys(had).length === (words ? 2 : 1))
    return clip;
  return { ...clip, captions: words ? { on, words } : { on } };
}

/**
 * Rewrite the captions of voices. Each id stands for its voice; the block
 * a voice has — whichever of its two clips held it — is handed to `change`
 * and the result is written on the clip that carries the voice.
 * @param {Edl} edl
 * @param {Iterable<string>|string} clipIds
 * @param {(block: CaptionsBlock, carrier: Clip) => CaptionsBlock} change
 * @returns {Edl} The same document when nothing changed
 */
function changeVoices(edl, clipIds, change) {
  const index = indexClips(edl);
  /** @type {Map<Clip, CaptionsBlock|null>} What each touched clip is to hold */
  const next = new Map();
  for (const id of idList(clipIds)) {
    const voice = voiceRef(index, id);
    // Neither clip of a pair is written when either sits on a locked track.
    if (!voice || voice.track.locked || voice.other?.track.locked) continue;
    if (next.has(voice.clip)) continue;
    next.set(voice.clip, change({ on: voice.on, words: voice.words }, voice.clip));
    if (voice.other) next.set(voice.other.clip, { on: false });
  }
  if (!next.size) return edl;
  return mapClips(edl, (clip) => (next.has(clip) ? withBlock(clip, next.get(clip)) : clip));
}

/**
 * Switch captions on or off for clips — one step for any number of them.
 * A linked picture and sound are one voice: naming either switches the
 * pair, and the sound clip holds the block. Clips that cannot have
 * captions (titles, generators, stills…) and clips on locked tracks are
 * left alone.
 * @param {Edl} edl
 * @param {Iterable<string>|string} clipIds
 * @param {boolean} [on=true]
 * @returns {Edl}
 */
export function setCaptions(edl, clipIds, on = true) {
  return changeVoices(edl, clipIds, (block) => ({ ...block, on: on !== false }));
}

/**
 * Switch captions on for every clip that can speak: each clip on an audio
 * track that plays a file and has words to show.
 * @param {Edl} edl
 * @param {(clip: Clip) => boolean} [hasWords] - Whether there is a
 *   transcript for the clip's file. Not asked for a clip that carries its
 *   own words. Without it every sound clip is switched on, except music
 *   clips, which only speak the words written on them
 * @returns {Edl}
 */
export function captionAllSpeech(edl, hasWords) {
  const index = indexClips(edl);
  const ids = [];
  for (const track of edl.tracks) {
    if (track.type !== 'audio') continue;
    for (const clip of track.clips) {
      const voice = voiceRef(index, clip.clipId);
      if (!voice || voice.on) continue;
      const known = hasWords ? hasWords(voice.clip) === true : !isMusicClip(voice.clip);
      if (voice.words || (voice.clip.sourceFile && known)) ids.push(clip.clipId);
    }
  }
  return setCaptions(edl, ids, true);
}

/**
 * Give a clip words of its own, in source seconds — they are then the ones
 * shown, instead of its file's transcript — or take them away again.
 * @param {Edl} edl
 * @param {string} clipId - Either clip of a linked pair
 * @param {unknown} words - `[[start, end, text], …]` (or `{ start, end,
 *   word }` objects); `null`, or a list with nothing usable, removes them
 * @returns {Edl}
 */
export function setCaptionWords(edl, clipId, words) {
  const own = Array.isArray(words) ? normalizeCaptions({ words }).words : undefined;
  return changeVoices(edl, clipId, (block) => {
    // The same words again: the list the clip holds stays the one it holds.
    const same = block.words && own && sameJson(block.words, own);
    return { on: block.on, words: same ? block.words : own };
  });
}
