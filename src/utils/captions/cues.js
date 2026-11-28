/**
 * Subtitle cues from a timeline's captions. The cues are the groups that
 * are drawn — same words, same breaks, same times (`timelineCues`) — or
 * the same words as phrases for reading (`phraseCues`): what a subtitle
 * file holds, defined here once for the render, the editor and the command
 * line. The files themselves are written by `cueFiles.js`.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Groups and timing.
 * @module utils/captions/cues
 */

import { captionGroups } from './groups.js';
import { captionVoices, voiceWords } from './voices.js';

/** @typedef {import('./types.js').Cue} Cue */

/**
 * Groups shaped for a subtitle file that will be read rather than watched
 * as a design: up to two lines of 40 characters, a phrase at a time. Pass
 * it as `timelineCues`' `group` option.
 */
export const SUBTITLE_GROUP = Object.freeze({ words: 12, chars: 80, lines: 2, pause: 0.8 });

/**
 * The cues of a timeline, in timeline seconds: one for every caption group
 * of every captioned clip that is heard, each from its first word to when
 * the group leaves the screen (never past its clip's end). Ordered by
 * start; two voices speaking at once give cues that overlap, the voice on
 * the upper track first — the way they stack on screen.
 * @param {{ tracks?: any[], captions?: { style?: unknown } }} edl
 * @param {(clip: any) => unknown} wordsOf - The transcript words of a
 *   clip's file (triples, a sidecar, or its word list); not asked for a
 *   clip that carries its own words. Nothing usable = no cues for that clip
 * @param {{ style?: unknown, group?: { words?: number, chars?: number, lines?: number,
 *   pause?: number } }} [options] - `style`: instead of the document's;
 *   `group`: other group limits than the style's (`SUBTITLE_GROUP`)
 * @returns {Cue[]}
 */
export function timelineCues(edl, wordsOf, options = {}) {
  const stored = options.style ?? edl?.captions?.style;
  /** @type {any} */
  const base = stored !== null && typeof stored === 'object' ? stored : { preset: stored };
  const style = options.group ? { ...base, group: { ...base.group, ...options.group } } : stored;
  /** @type {(Cue & { voice: number })[]} */
  const cues = [];
  captionVoices(edl).forEach((voice, index) => {
    const own = Array.isArray(voice.clip.captions?.words);
    const words = voiceWords(
      voice,
      own || typeof wordsOf !== 'function' ? null : wordsOf(voice.clip),
    );
    for (const group of captionGroups(words, style)) {
      const end = Math.min(group.until, voice.sound.timelineEnd);
      if (end > group.start) cues.push({ start: group.start, end, text: group.text, voice: index });
    }
  });
  cues.sort((a, b) => a.start - b.start || a.voice - b.voice);
  return cues.map(({ start, end, text }) => ({ start, end, text }));
}

/**
 * The cues of a timeline as **phrases for reading** — what a subtitle file
 * is made of: up to two lines, a phrase at a time (`SUBTITLE_GROUP`), with
 * the capitals and the punctuation the words were written with, whatever
 * the timeline's style does to them on screen. A design may shout or drop
 * its commas; a file that is read keeps the text as it is.
 * @param {{ tracks?: any[], captions?: { style?: unknown } }} edl
 * @param {(clip: any) => unknown} wordsOf - As for `timelineCues`
 * @returns {Cue[]}
 */
export function phraseCues(edl, wordsOf) {
  const stored = edl?.captions?.style;
  const base = stored !== null && typeof stored === 'object' ? stored : { preset: stored };
  const reading = { ...base, case: 'as-is', punctuation: 'keep' };
  return timelineCues(edl, wordsOf, { style: reading, group: SUBTITLE_GROUP });
}

export {
  SUBTITLE_FORMATS,
  formatSrt,
  formatSubtitles,
  formatTimestamp,
  formatVtt,
} from './cueFiles.js';
