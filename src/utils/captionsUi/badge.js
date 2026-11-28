/**
 * The "CC" badge on timeline clips: a captioned clip shows it — on the
 * sound clip that carries the captions and on the picture linked to it —
 * and it turns into a warning when captions are on but the file has no
 * transcript to show, and into a busy mark while that transcript is being
 * made. Registered with the timeline's badge registry; importing this
 * module is what switches it on.
 * @module utils/captionsUi/badge
 */

import { getDoc } from '#utils/editor/session.js';
import { captionedClips } from '#utils/edl/index.js';
import { badgesChanged, registerClipBadge } from '#utils/timeline/badges.js';
import { playedWords, wordCount } from './clipState.js';
import { jobOf, transcribeState } from './transcribe.js';
import { wordBook } from './words.js';

/** @typedef {import('#utils/timeline/badges.js').ClipBadge} ClipBadge */

/** @type {WeakMap<object, Map<string, any>>} By document: clip id → the clip that carries its captions */
const carriers = new WeakMap();

/**
 * The captioned clips of a document, each under its own id and under the
 * id of its linked partner.
 * @param {any} doc
 * @returns {Map<string, any>}
 */
function carriersOf(doc) {
  let map = carriers.get(doc);
  if (!map) {
    map = new Map();
    for (const { clip } of captionedClips(doc)) {
      map.set(clip.clipId, clip);
      if (clip.linkedClipId) map.set(clip.linkedClipId, clip);
    }
    carriers.set(doc, map);
  }
  return map;
}

/**
 * The badge of a clip.
 * @param {any} clip
 * @param {any} doc - The document the clip is in
 * @param {(file: string) => import('./words.js').FileWords} wordsOf
 * @param {(file: string) => import('./transcribe.js').FileJob|null} [jobFor]
 * @returns {ClipBadge|null} null for a clip without captions
 */
export function captionBadge(clip, doc, wordsOf, jobFor = () => null) {
  const carrier = doc?.tracks ? carriersOf(doc).get(clip?.clipId) : null;
  if (!carrier) return null;
  const own = carrier.captions?.words;
  if (own) {
    const count = playedWords(own, carrier);
    return { id: 'captions', text: 'CC', tone: 'on', title: `Captions: ${wordCount(count)}` };
  }
  if (jobFor(carrier.sourceFile)?.active) {
    const title = 'Captions are on — the transcript is being made';
    return { id: 'captions', text: 'CC…', tone: 'busy', title };
  }
  const known = wordsOf(carrier.sourceFile);
  if (known.state === 'none') {
    const title = 'Captions are on, but this file has no transcript — see Inspector ▸ Captions';
    return { id: 'captions', text: 'CC', tone: 'warn', title };
  }
  const count = known.state === 'ready' ? playedWords(known.words, carrier) : 0;
  const title = count ? `Captions: ${wordCount(count)}` : 'Captions are on';
  return { id: 'captions', text: 'CC', tone: 'on', title };
}

registerClipBadge((clip) => captionBadge(clip, getDoc(), wordBook.get, jobOf));
// Words arriving and jobs moving change the badge without changing the document.
wordBook.subscribe(badgesChanged);
transcribeState.subscribe(badgesChanged);
