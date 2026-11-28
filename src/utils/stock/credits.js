/**
 * What a timeline owes: the credits of its clips, each source once, in the
 * order the sources first appear, with the clips that use each and what
 * its licence asks for. Only clips that are seen or heard count — a muted
 * track, or one left out by a solo, shows nothing and owes nothing.
 * Isomorphic and pure. Contract: docs/app-spec/STOCK.md § In the document.
 * @module utils/stock/credits
 */

import { activeTracks } from '#utils/edl/query.js';
import { cleanCredit, creditKey } from './credit.js';
import { licenseFacts } from './licenses.js';

/**
 * @typedef {import('./credit.js').Credit & {
 *   key: string, clips: string[], start: number, required: boolean, licenseName: string,
 *   shareAlike: boolean, nonCommercial: boolean, noDerivatives: boolean, known: boolean,
 * }} CreditEntry - A credit with: `key` (the same for the same work), `clips`
 *   (ids of the clips that use it, in order), `start` (when it first
 *   appears, seconds), `required` (its licence asks for the credit — also
 *   true for a licence that is not known or not named), `licenseName`
 *   (plain: `CC BY 4.0`; '' without a licence), and what else the licence
 *   asks for
 */

/**
 * The credits of a timeline.
 * @param {any} edl
 * @param {{ range?: { start: number, end: number } | null }} [options] -
 *   `range`: only what shows in this part, seconds (a range render)
 * @returns {CreditEntry[]}
 */
export function credits(edl, options = {}) {
  const tracks = Array.isArray(edl?.tracks) ? edl.tracks.filter(Boolean) : [];
  const from = options.range ? options.range.start : -Infinity;
  const to = options.range && Number.isFinite(options.range.end) ? options.range.end : Infinity;
  /** @type {{ clip: any, row: number }[]} */
  const uses = [];
  [...activeTracks(tracks, 'video'), ...activeTracks(tracks, 'audio')].forEach((track, row) => {
    for (const clip of Array.isArray(track.clips) ? track.clips : []) {
      if (clip?.credit && clip.timelineEnd > from && clip.timelineStart < to)
        uses.push({ clip, row });
    }
  });
  uses.sort((a, b) => a.clip.timelineStart - b.clip.timelineStart || a.row - b.row);
  /** @type {Map<string, CreditEntry>} */
  const found = new Map();
  for (const { clip } of uses) {
    const credit = cleanCredit(clip.credit);
    if (!credit) continue;
    const key = creditKey(credit);
    const known = found.get(key);
    if (known) {
      known.clips.push(clip.clipId);
      continue;
    }
    const facts = licenseFacts(credit.license);
    const { shareAlike, nonCommercial, noDerivatives } = facts;
    found.set(key, {
      ...credit,
      ...{ key, clips: [clip.clipId], start: clip.timelineStart, required: facts.attribution },
      ...{ licenseName: credit.license ? facts.name : '', known: facts.known },
      ...{ shareAlike, nonCommercial, noDerivatives },
    });
  }
  return [...found.values()];
}

/**
 * What to tell a person who is about to export, in plain sentences: how
 * many credits are owed and how they are given, and what the licences ask
 * for beyond a credit. NearEdit never refuses an export over a licence.
 * @param {CreditEntry[]} list - `credits(edl)`
 * @returns {string[]} Empty when the timeline owes nothing
 */
export function creditsStatement(list) {
  const count = (/** @type {number} */ n, /** @type {string} */ one) =>
    `${n} ${one}${n === 1 ? '' : 's'}`;
  const named = (/** @type {CreditEntry[]} */ some) =>
    some.map((entry) => entry.title || entry.creator || entry.url || 'untitled').join(', ');
  const required = list.filter((entry) => entry.required);
  /** @type {string[]} */
  const lines = [];
  if (!list.length) return lines;
  lines.push(
    required.length
      ? `${count(required.length, 'source')} must be credited: ${named(required)}. The credits file or the credits card gives the credit.`
      : `${count(list.length, 'source')} can be credited; none of the licences demands it.`,
  );
  const alike = list.filter((entry) => entry.known && entry.shareAlike);
  if (alike.length)
    lines.push(
      `Share alike (${named(alike)}): the finished video has to be published under the same licence.`,
    );
  const unpaid = list.filter((entry) => entry.known && entry.nonCommercial);
  if (unpaid.length)
    lines.push(`Non-commercial (${named(unpaid)}): the video may not be used to earn money.`);
  const fixed = list.filter((entry) => entry.known && entry.noDerivatives);
  if (fixed.length)
    lines.push(`No derivatives (${named(fixed)}): the licence does not allow changing the work.`);
  const unread = list.filter((entry) => entry.license && !entry.known);
  if (unread.length)
    lines.push(`NearEdit cannot read the licence of: ${named(unread)}. Check what it asks for.`);
  return lines;
}
