/**
 * Subtitle cues from a timeline's captions, and the files they make. The
 * cues are the groups that are drawn — same words, same breaks, same times
 * — unless a caller asks for groups shaped for reading.
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
 * @param {unknown} value
 * @returns {number} The value when it is a number that can be written, otherwise 0
 */
const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * Seconds as a subtitle timestamp, `HH:MM:SS,mmm`. Rounded once, to the
 * millisecond, so 59.9996 s is 00:01:00,000 and never 00:00:60,000.
 * @param {number} seconds
 * @param {','|'.'} [separator=','] - `,` in SRT, `.` in WebVTT
 * @returns {string}
 */
export function formatTimestamp(seconds, separator = ',') {
  const total = Math.max(0, Math.round(finite(seconds) * 1000));
  const pad = (/** @type {number} */ value, width = 2) => String(value).padStart(width, '0');
  const [h, m] = [Math.floor(total / 3_600_000), Math.floor(total / 60_000) % 60];
  const s = Math.floor(total / 1000) % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(total % 1000, 3)}`;
}

/**
 * Cues ready to write: with text, in order, each at least a millisecond
 * long, and no blank line inside a text (it would end the cue).
 * @param {unknown} cues
 * @returns {Cue[]}
 */
function writable(cues) {
  /** @type {Cue[]} */
  const out = [];
  for (const cue of Array.isArray(cues) ? cues : []) {
    const lines = (typeof cue?.text === 'string' ? cue.text : '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const start = cue?.start;
    if (!lines.length || typeof start !== 'number' || !Number.isFinite(start)) continue;
    const end = Math.max(finite(cue.end), start + 0.001);
    out.push({ start, end, text: lines.join('\n') });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Cues as a SubRip file.
 * @param {unknown} cues - `[{ start, end, text }]`, seconds
 * @returns {string} '' when there are none
 */
export function formatSrt(cues) {
  return writable(cues)
    .map((cue, i) => {
      const times = `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`;
      return `${i + 1}\n${times}\n${cue.text}\n`;
    })
    .join('\n');
}

/**
 * Cues as a WebVTT file. `&`, `<` and `>` are written as entities, and an
 * arrow in a text (it would be read as a timing line) as `->`.
 * @param {unknown} cues - `[{ start, end, text }]`, seconds
 * @returns {string} At least the header
 */
export function formatVtt(cues) {
  const escaped = (/** @type {string} */ text) =>
    text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('-->', '->')
      .replaceAll('>', '&gt;');
  const body = writable(cues).map((cue) => {
    const times = `${formatTimestamp(cue.start, '.')} --> ${formatTimestamp(cue.end, '.')}`;
    return `${times}\n${escaped(cue.text)}\n`;
  });
  return `WEBVTT\n\n${body.join('\n')}`;
}
