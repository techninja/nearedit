/**
 * Subtitle files from a timeline's captions — the same words, from the
 * same transcripts, as the picture shows. A render can save one beside its
 * video; `nearedit captions` writes one on its own.
 * Reference: docs/app-spec/CAPTIONS.md § Groups and timing.
 * @module api/render/subtitles
 */

import { formatSubtitles, phraseCues, timelineCues } from '#utils/captions/cues.js';
import { wordsFrom } from './words.js';

export { SUBTITLE_FORMATS } from '#utils/captions/cues.js';
/**
 * `phrases`: two-line phrases for reading, with the capitals and the
 * punctuation the words were written with, whatever the style does to them
 * on screen. `drawn`: the groups exactly as the picture shows them.
 */
export const SUBTITLE_SHAPES = ['phrases', 'drawn'];

/**
 * The cues of a document — of the whole timeline, or of the part a range
 * render shows, timed from its start.
 * @param {any} edl
 * @param {import('./words.js').WordTable} words - Transcripts by file (`loadWords`)
 * @param {{ as?: string, range?: { start: number, end: number } | null }} [options] -
 *   `as`: `phrases` (the default) or `drawn`
 * @returns {import('#utils/captions/types.js').Cue[]}
 */
export function subtitleCues(edl, words, options = {}) {
  const wordsOf = wordsFrom(words);
  const cues = options.as === 'drawn' ? timelineCues(edl, wordsOf) : phraseCues(edl, wordsOf);
  const { range } = options;
  if (!range) return cues;
  const [from, to] = [range.start, Number.isFinite(range.end) ? range.end : Infinity];
  return cues
    .filter((cue) => cue.end > from && cue.start < to)
    .map((cue) => ({
      ...cue,
      start: Math.max(0, cue.start - from),
      end: Math.min(cue.end, to) - from,
    }));
}

/**
 * Cues as the text of a subtitle file.
 * @param {import('#utils/captions/types.js').Cue[]} cues
 * @param {string} format - `srt` or `vtt`
 * @returns {string}
 */
export function subtitleText(cues, format) {
  return formatSubtitles(cues, format);
}

/**
 * The name of the subtitle file that belongs to a video: `talk.mp4` →
 * `talk.srt`, the name players look for beside it.
 * @param {string} video - File name or path of the video
 * @param {string} format
 * @returns {string}
 */
export function subtitleName(video, format) {
  return `${video.replace(/\.[^./\\]+$/, '')}.${format}`;
}
