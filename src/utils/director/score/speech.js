/**
 * Finding where a clip speaks, on the timeline: the words of its file's
 * transcript that the clip plays, mapped through its source window; for a
 * file without word times its transcript segments; and for a voice without
 * any transcript, whatever of the clip is not analysed as silence.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Under speech. Isomorphic and pure.
 * @module utils/director/score/speech
 */

import { wordRange } from '#utils/director/speech.js';
import { joinSpans } from './duck.js';

/** @typedef {import('./duck.js').Span} Span */

/**
 * What of a media file tells where it speaks.
 * @typedef {Object} Voice
 * @property {{ start: number, end: number }[]} words
 * @property {{ start: number, end: number }[]} segments
 * @property {{ start: number, end: number }[]} silences
 */

/** Words closer together than this are one stretch of speech. */
const BREATH = 0.35;
/** @type {(seconds: number) => number} To the millisecond. */
const tidy = (seconds) => Math.round(seconds * 1000) / 1000;

/**
 * Where a clip speaks.
 * @param {{ timelineStart: number, timelineEnd: number, sourceIn: number,
 *   sourceOut: number }} clip
 * @param {Voice} media
 * @param {boolean} voice - The clip is known to be a voice (a narration, a
 *   speech-led file): without a transcript, everything that is not
 *   silence counts as speech
 * @returns {{ spans: Span[], from: 'words'|'segments'|'sound'|'' }} Timeline
 *   seconds, inside the clip; `from` says what they were found by ('' =
 *   nothing to go by)
 */
export function clipSpeech(clip, media, voice) {
  const { sourceIn, sourceOut } = clip;
  /** @param {{ start: number, end: number }[]} sources */
  const onTimeline = (sources) =>
    joinSpans(
      sources
        .map((span) => ({
          start: tidy(clip.timelineStart + Math.max(sourceIn, span.start) - sourceIn),
          end: tidy(clip.timelineStart + Math.min(sourceOut, span.end) - sourceIn),
        }))
        .filter((span) => span.end > span.start),
      BREATH,
    );
  const inside = wordRange(media.words, sourceIn, sourceOut);
  if (inside) {
    return { spans: onTimeline(media.words.slice(inside.first, inside.last + 1)), from: 'words' };
  }
  // A transcript with word times and no word in the window: nothing is said here.
  if (media.words.length) return { spans: [], from: 'words' };
  const spoken = media.segments.filter((s) => s.end > sourceIn && s.start < sourceOut);
  if (media.segments.length) return { spans: onTimeline(spoken), from: 'segments' };
  if (!voice) return { spans: [], from: '' };
  // The stretches between the silences.
  const sounds = [];
  let at = sourceIn;
  for (const quiet of [...media.silences].sort((a, b) => a.start - b.start)) {
    if (quiet.start > at) sounds.push({ start: at, end: Math.min(sourceOut, quiet.start) });
    at = Math.max(at, quiet.end);
  }
  if (at < sourceOut) sounds.push({ start: at, end: sourceOut });
  return { spans: onTimeline(sounds), from: 'sound' };
}
