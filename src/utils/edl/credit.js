/**
 * A clip's credit as edits: writing one by hand, changing or removing it,
 * and giving the clips of a document the credits of the files they play.
 * A clip keeps `credit: { title, creator, creatorUrl, provider, license,
 * licenseUrl, url }` — only the parts that say something — through every
 * edit: split, trim, move, copy. `updateClip` cannot write it.
 * Isomorphic and pure. Contract: docs/app-spec/STOCK.md § In the document.
 * @module utils/edl/credit
 */

import { cleanCredit, creditFromSource } from '#utils/stock/credit.js';
import { idList, mapClips } from './immutable.js';
import { sameJson } from './jsonBag.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */

/**
 * A clip with its credit replaced, or without one.
 * @param {Clip} clip
 * @param {import('#utils/stock/credit.js').Credit|null} credit - Clean, or null
 * @returns {Clip} The clip itself when it already says exactly that
 */
function withCredit(clip, credit) {
  if (credit ? sameJson(credit, clip.credit) : clip.credit === undefined) return clip;
  if (credit) return { ...clip, credit };
  const rest = { ...clip };
  delete rest.credit;
  return rest;
}

/**
 * Write, replace or remove the credit of clips — one step for any number
 * of them. Any clip can carry one: a picture, footage, music, a title.
 * @param {Edl} edl
 * @param {Iterable<string>|string} clipIds - Clips on locked tracks are left alone
 * @param {any} credit - `{ title, creator, creatorUrl, provider, license,
 *   licenseUrl, url }`, read as `cleanCredit` reads it (text cut to its
 *   limit, web addresses only); `null`, or one that names no title, creator,
 *   licence or page, removes the credit
 * @returns {Edl} The same document when nothing changed
 */
export function setCredit(edl, clipIds, credit) {
  const ids = new Set(idList(clipIds));
  if (!ids.size) return edl;
  const clean = cleanCredit(credit);
  return mapClips(edl, (clip) => (ids.has(clip.clipId) ? withCredit(clip, clean) : clip));
}

/**
 * Give clips the credit of the file they play: every clip **without** a
 * credit whose file is among `items` with a `source` gets what that source
 * asks for. A credit that is there — written by hand, or changed — is never
 * replaced. For documents made by something other than `insertMedia`: a
 * director's assembly, a script, a document from before the file had a
 * source. Clips on locked tracks get it too: it changes nothing a person made.
 * @param {Edl} edl
 * @param {Iterable<{ filePath: string, source?: any }>} items - Media items
 *   (`GET /media`), or any `{ filePath, source }`
 * @returns {Edl} The same document when no clip takes a credit
 */
export function attachCredits(edl, items) {
  /** @type {Map<string, import('#utils/stock/credit.js').Credit>} */
  const byFile = new Map();
  for (const item of items || []) {
    const credit = item?.filePath ? creditFromSource(item.source) : null;
    if (credit) byFile.set(item.filePath, credit);
  }
  if (!byFile.size) return edl;
  const attach = (/** @type {Clip} */ clip) =>
    !clip.credit && byFile.has(clip.sourceFile) ? { ...clip, credit: byFile.get(clip.sourceFile) } : clip;
  return mapClips(edl, attach, true);
}
