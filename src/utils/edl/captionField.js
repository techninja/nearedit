/**
 * The captions fields of a document as data: reading them from a loaded
 * document and checking them. A clip that plays video or sound may carry
 * `captions: { on, words? }`; the document may carry `captions: { style }`.
 * Both are absent when there is nothing to say, so a document without
 * captions is unchanged. Isomorphic and pure.
 * Contract: docs/app-spec/CAPTIONS.md § In the document.
 * @module utils/edl/captionField
 */

import { normalizeCaptionStyle } from '#utils/captions/resolve.js';
import { normalizeCaptions } from '#utils/captions/words.js';
import { isTimed } from './immutable.js';
import { isPlainObject, sameJson } from './jsonBag.js';

/** @typedef {import('#utils/captions/types.js').CaptionsBlock} CaptionsBlock */
/** @typedef {(path: string, message: string) => void} Report */

/**
 * @param {any} raw - A stored block
 * @param {CaptionsBlock} clean - What `normalizeCaptions` made of it
 * @returns {boolean} True when the stored block is already that, to the last word
 */
function sameBlock(raw, clean) {
  if (raw.on !== clean.on || Object.keys(raw).length !== (clean.words ? 2 : 1)) return false;
  if (!clean.words) return true;
  const words = raw.words;
  if (!Array.isArray(words) || words.length !== clean.words.length) return false;
  return clean.words.every((word, i) => {
    const stored = words[i];
    if (!Array.isArray(stored) || stored.length !== 3) return false;
    return stored[0] === word[0] && stored[1] === word[1] && stored[2] === word[2];
  });
}

/**
 * Read a clip's `captions` block: whether captions are on, and the clip's
 * own words when it carries any (`normalizeCaptions`).
 * @param {any} raw
 * @returns {CaptionsBlock|null} null when there is nothing to keep —
 *   captions off and no words; the stored block itself when it is already clean
 */
export function cleanCaptions(raw) {
  if (!isPlainObject(raw)) return null;
  const clean = normalizeCaptions(raw);
  if (!clean.on && !clean.words) return null;
  return sameBlock(raw, clean) ? raw : clean;
}

/**
 * Check a clip's `captions` field for `validateEdl`: absent, or exactly
 * what `cleanCaptions` keeps, on a clip that plays video or sound.
 * @param {any} clip
 * @param {any} track - The track that holds it
 * @param {string} path - Path of the clip
 * @param {Report} report
 */
export function checkCaptions(clip, track, path, report) {
  if (clip.captions === undefined) return;
  const at = `${path}.captions`;
  if (cleanCaptions(clip.captions) !== clip.captions) {
    report(at, 'must be { on, words? } with words as [start, end, text] in time order');
  } else if (!isTimed(clip, track)) {
    report(at, 'only a clip that plays video or sound has captions');
  }
}

/**
 * Read a document's `captions` block: the style every caption is drawn
 * with, stored as a preset's name and what differs from it.
 * @param {any} raw
 * @returns {{ style: Record<string, any> }|null} null when the document
 *   names no style; the stored block itself when it is already clean
 */
export function cleanDocumentCaptions(raw) {
  if (!isPlainObject(raw)) return null;
  const named = typeof raw.style === 'string' || isPlainObject(raw.style);
  if (!named) return null;
  const style = normalizeCaptionStyle(raw.style);
  return Object.keys(raw).length === 1 && sameJson(raw.style, style) ? raw : { style };
}

/**
 * Check a document's `captions` field for `validateEdl`.
 * @param {any} captions
 * @param {Report} report
 */
export function checkDocumentCaptions(captions, report) {
  if (captions === undefined) return;
  if (cleanDocumentCaptions(captions) !== captions) {
    report('captions', 'must be { style } with a style as normalizeCaptionStyle writes it');
  }
}

/**
 * Let clips that carry the same words share one block. A clip that was
 * split keeps one list of words for all its pieces in memory; a saved file
 * writes it once per piece, and loading brings the pieces back together.
 * @param {any[]} tracks - Normalised tracks
 * @returns {any[]} The same tracks when nothing was shared
 */
export function shareCaptions(tracks) {
  /** @type {Map<string, CaptionsBlock>} */
  const seen = new Map();
  return tracks.map((track) => {
    let changed = false;
    const clips = track.clips.map((/** @type {any} */ clip) => {
      if (!clip.captions?.words) return clip;
      const key = JSON.stringify(clip.captions);
      const first = seen.get(key);
      if (!first) seen.set(key, clip.captions);
      if (!first || first === clip.captions) return clip;
      changed = true;
      return { ...clip, captions: first };
    });
    return changed ? { ...track, clips } : track;
  });
}
