/**
 * Correcting a mis-heard word: the text changes, the timing does not. The
 * result is a sidecar patch for `PUT /api/sidecar` that keeps `transcript`
 * and `segments` telling the same story. Pure and isomorphic.
 * @module utils/transcript/correct
 */

/** @typedef {import('./units.js').Unit} Unit */

const ATTACHES = /^['’\-.,!?;:%)\]]/;

/**
 * Text of a phrase rebuilt from the words spoken inside it.
 * @param {{ word?: string, start: number, end: number }[]} words
 * @param {{ start: number, end: number }} segment
 * @returns {string}
 */
function segmentText(words, segment) {
  let text = '';
  for (const word of words) {
    const mid = (word.start + word.end) / 2;
    const token = String(word.word ?? '').trim();
    if (!token || mid < segment.start - 1e-3 || mid > segment.end + 1e-3) continue;
    text += text && !ATTACHES.test(token) ? ` ${token}` : token;
  }
  return text;
}

/**
 * The sidecar patch that changes one unit's text.
 * @param {Record<string, any>} sidecar - The current sidecar
 * @param {Unit} unit - The unit being corrected
 * @param {import('./units.js').UnitLevel} level - What units are made of
 * @param {string} text - The new text
 * @returns {{ transcript?: any[], segments?: any[] }|null} null when there
 *   is nothing to save (empty or unchanged text, unknown unit)
 */
export function correctionPatch(sidecar, unit, level, text) {
  const next = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!next || !unit || next === unit.text) return null;
  const segments = Array.isArray(sidecar?.segments) ? sidecar.segments : [];
  if (level === 'segment') {
    if (!segments[unit.index]) return null;
    return { segments: segments.map((s, i) => (i === unit.index ? { ...s, text: next } : s)) };
  }
  const words = Array.isArray(sidecar?.transcript) ? sidecar.transcript : [];
  const old = words[unit.index];
  if (level !== 'word' || !old) return null;
  // Whisper-style words carry their leading space; keep it.
  const lead = /^\s*/.exec(String(old.word ?? ''))[0];
  const transcript = words.map((w, i) => (i === unit.index ? { ...w, word: lead + next } : w));
  const mid = (old.start + old.end) / 2;
  const holds = (/** @type {any} */ s) => mid >= s.start - 1e-3 && mid <= s.end + 1e-3;
  if (!segments.some(holds)) return { transcript };
  return {
    transcript,
    segments: segments.map((s) => (holds(s) ? { ...s, text: segmentText(transcript, s) } : s)),
  };
}
