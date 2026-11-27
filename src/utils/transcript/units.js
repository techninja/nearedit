/**
 * Transcript units — the clickable pieces of a transcript. Normally one
 * unit per word; when a provider returned no word timings the phrases
 * (`segments`) stand in, so every feature still works at phrase level.
 * Sidecar shape: docs/app-spec/INTELLIGENCE.md § Transcription. Pure.
 * @module utils/transcript/units
 */

/**
 * @typedef {Object} Unit
 * @property {string} text - As written, trimmed
 * @property {number} start - Seconds into the source
 * @property {number} end
 * @property {number} index - Position in the sidecar array it came from
 */

/** @typedef {'word'|'segment'|'none'} UnitLevel */

/**
 * How far before a word's start its region begins: cuts land in the gap in
 * front of a word, never on its first sound, even after frame snapping.
 */
export const LEAD = 0.04;

/**
 * @param {any[]} list - Sidecar `transcript` or `segments`
 * @param {string} field - `word` or `text`
 * @returns {Unit[]} Valid entries in time order
 */
function toUnits(list, field) {
  const units = [];
  (Array.isArray(list) ? list : []).forEach((entry, index) => {
    const text = String(entry?.[field] ?? '').trim();
    if (!text || !Number.isFinite(entry.start) || !Number.isFinite(entry.end)) return;
    units.push({ text, start: entry.start, end: Math.max(entry.start, entry.end), index });
  });
  return units.sort((a, b) => a.start - b.start);
}

/**
 * The units of a sidecar's transcript.
 * @param {Record<string, any>|null|undefined} sidecar
 * @returns {{ units: Unit[], level: UnitLevel }}
 */
export function transcriptUnits(sidecar) {
  const words = toUnits(sidecar?.transcript, 'word');
  if (words.length) return { units: words, level: 'word' };
  const phrases = toUnits(sidecar?.segments, 'text');
  return phrases.length ? { units: phrases, level: 'segment' } : { units: [], level: 'none' };
}

/**
 * Where each unit's region begins. Regions tile the source: unit k owns
 * `[edges[k], edges[k + 1])`, i.e. the word and the pause after it. An edge
 * sits `LEAD` before the word, but never past the middle of the gap to the
 * previous word.
 * @param {Unit[]} units
 * @returns {number[]}
 */
export function unitEdges(units) {
  return units.map((unit, k) => {
    if (k === 0) return Math.max(0, unit.start - LEAD);
    const gap = Math.max(0, unit.start - units[k - 1].end);
    return unit.start - Math.min(LEAD, gap / 2);
  });
}

/**
 * The unit being spoken at a source time: the last one that has started.
 * @param {Unit[]} units
 * @param {number} time - Seconds into the source
 * @returns {number} Index, or -1 before the first unit
 */
export function unitAt(units, time) {
  let lo = 0;
  let hi = units.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (units[mid].start <= time + 1e-6) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Plain text of a run of units.
 * @param {Unit[]} units
 * @param {number} first
 * @param {number} last
 * @returns {string}
 */
export function rangeText(units, first, last) {
  return units
    .slice(Math.max(0, first), last + 1)
    .map((unit) => unit.text)
    .join(' ');
}
