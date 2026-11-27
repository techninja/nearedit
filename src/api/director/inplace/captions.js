/**
 * Caption timing — the transcript of a timeline clip as readable phrases,
 * mapped from source time to timeline time.
 * @module api/director/inplace/captions
 */

import { groupPhrases } from '#utils/director/phrases.js';
import { clamp } from '#utils/director/snap.js';
import { wordRange } from '#utils/director/speech.js';

/**
 * @typedef {{ text: string, start: number, end: number }} Cue - Timeline seconds
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 */

/**
 * Phrases for a file that has transcript segments but no word timestamps:
 * each segment's text is split to length and its time shared out by the
 * number of characters.
 * @param {MediaInfo} media
 * @param {number} from - Source seconds
 * @param {number} to
 * @param {number} maxChars
 * @returns {Cue[]} In source seconds
 */
export function segmentPhrases(media, from, to, maxChars) {
  const cues = [];
  for (const segment of media.segments) {
    const middle = (segment.start + segment.end) / 2;
    if (middle < from || middle > to || !segment.text) continue;
    const pretend = segment.text.split(/\s+/).map((word, i) => ({ word, start: i, end: i + 1 }));
    const total = segment.text.length || 1;
    let at = segment.start;
    for (const phrase of groupPhrases(pretend, {
      maxChars,
      maxDuration: Infinity,
      maxGap: Infinity,
    })) {
      const length = ((segment.end - segment.start) * (phrase.text.length + 1)) / (total + 1);
      cues.push({ text: phrase.text, start: at, end: Math.min(segment.end, at + length) });
      at += length;
    }
  }
  return cues;
}

/**
 * Caption cues for the part of a file a clip plays, in timeline time.
 * @param {any} clip
 * @param {MediaInfo} media
 * @param {{ maxChars: number, maxDuration: number }} opts
 * @returns {Cue[]}
 */
export function clipCues(clip, media, opts) {
  const inside = wordRange(media.words, clip.sourceIn, clip.sourceOut);
  let phrases = [];
  if (inside) phrases = groupPhrases(media.words.slice(inside.first, inside.last + 1), opts);
  else if (!media.words.length)
    phrases = segmentPhrases(media, clip.sourceIn, clip.sourceOut, opts.maxChars);
  const toTimeline = (/** @type {number} */ source) =>
    clamp(clip.timelineStart + source - clip.sourceIn, clip.timelineStart, clip.timelineEnd);
  return phrases
    .map((p) => ({ text: p.text, start: toTimeline(p.start), end: toTimeline(p.end) }))
    .filter((cue) => cue.end > cue.start);
}

/**
 * Give cues readable timing on the frame grid: each lingers a moment after
 * its last word and shows for at least 0.7s, but never past the next cue.
 * @param {Cue[]} cues
 * @param {number} fps
 * @returns {{ text: string, startF: number, endF: number }[]} Ascending, no overlaps
 */
export function timeCues(cues, fps) {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const out = [];
  let lastEndF = 0;
  sorted.forEach((cue, i) => {
    const nextStart = sorted[i + 1]?.start ?? Infinity;
    const end = Math.min(Math.max(cue.end + 0.3, cue.start + 0.7), Math.max(nextStart, cue.end));
    const startF = Math.max(Math.round(cue.start * fps), lastEndF);
    const endF = Math.round(end * fps);
    if (endF - startF < 2) return;
    out.push({ text: cue.text, startF, endF });
    lastEndF = endF;
  });
  return out;
}

/**
 * Caption look, sized to the output frame.
 * @param {Record<string, any>} params - `position`, `size` and `background` of add_captions
 * @param {{ width: number, height: number }} format
 * @returns {{ text: object, transform: object, lineChars: number }}
 */
export function captionStyle(params, format) {
  const base = Math.min(format.height, format.width * 1.2);
  const scale = { small: 0.035, medium: 0.045, large: 0.06 }[params.size] || 0.045;
  const fontSize = Math.round(base * scale);
  const offset = { top: -0.36, middle: 0, bottom: 0.36 }[params.position] ?? 0.36;
  return {
    text: {
      fontSize,
      bold: true,
      color: '#ffffff',
      outlineColor: '#000000',
      outlineWidth: Math.max(2, Math.round(fontSize / 12)),
      background: params.background ? '#000000' : '',
    },
    transform: { y: Math.round(format.height * offset) },
    lineChars: Math.max(8, Math.floor((format.width * 0.86) / (fontSize * 0.55))),
  };
}
