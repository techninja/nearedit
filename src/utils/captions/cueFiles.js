/**
 * Subtitle files — cues written out as SubRip or WebVTT. What the cues are
 * is `cues.js`' business; here they are only made writable and written.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Groups and timing.
 * @module utils/captions/cueFiles
 */

/** @typedef {import('./types.js').Cue} Cue */

/** The subtitle formats there are, by file extension. */
export const SUBTITLE_FORMATS = ['srt', 'vtt'];

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

/**
 * Cues as the text of a subtitle file of a format.
 * @param {unknown} cues - `[{ start, end, text }]`, seconds
 * @param {string} format - `vtt` for WebVTT; anything else is SubRip
 * @returns {string}
 */
export function formatSubtitles(cues, format) {
  return format === 'vtt' ? formatVtt(cues) : formatSrt(cues);
}
