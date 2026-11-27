/**
 * Transcript export — json, srt, vtt or plain text from a sidecar.
 * @module api/intelligence/transcriptExport
 */

export const EXPORT_FORMATS = {
  json: 'application/json; charset=utf-8',
  srt: 'application/x-subrip; charset=utf-8',
  vtt: 'text/vtt; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};

const MAX_CUE_WORDS = 10;
const MAX_CUE_SECONDS = 5;
const CUE_GAP = 0.8; // a pause this long always starts a new cue

/**
 * Format seconds as a subtitle timestamp. Hours are always written and are
 * not capped at 99; rounding happens once, in milliseconds, so 59.9996 s
 * becomes 00:01:00.000 rather than 00:00:60.000.
 * @param {number} seconds
 * @param {','|'.'} [separator] - ',' for SRT, '.' for WebVTT
 * @returns {string}
 */
export function formatTimestamp(seconds, separator = ',') {
  const total = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms, 3)}`;
}

/**
 * Subtitle cues for a transcript: its segments, or — when a provider gave
 * only words — words grouped into short lines.
 * @param {{ transcript?: any[]|null, segments?: any[]|null }} sidecar
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function toCues(sidecar) {
  const segments = (sidecar.segments || []).filter((s) => String(s?.text ?? '').trim());
  if (segments.length) {
    return segments.map((s) => ({ start: s.start, end: s.end, text: String(s.text).trim() }));
  }
  const cues = [];
  let current = null;
  let count = 0;
  for (const word of sidecar.transcript || []) {
    const fresh =
      !current ||
      count >= MAX_CUE_WORDS ||
      word.start - current.end > CUE_GAP ||
      word.end - current.start > MAX_CUE_SECONDS;
    if (fresh) {
      current = { start: word.start, end: word.end, text: word.word };
      cues.push(current);
      count = 1;
    } else {
      current.text += ` ${word.word}`;
      current.end = word.end;
      count++;
    }
  }
  return cues;
}

/**
 * @param {{ start: number, end: number, text: string }[]} cues
 * @returns {string}
 */
export function toSrt(cues) {
  return cues
    .map((cue, i) => {
      const times = `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`;
      return `${i + 1}\n${times}\n${cue.text}\n`;
    })
    .join('\n');
}

/**
 * @param {{ start: number, end: number, text: string }[]} cues
 * @returns {string}
 */
export function toVtt(cues) {
  const body = cues.map((cue) => {
    const times = `${formatTimestamp(cue.start, '.')} --> ${formatTimestamp(cue.end, '.')}`;
    // "-->" inside the text would be read as a timing line.
    return `${times}\n${cue.text.replaceAll('-->', '->')}\n`;
  });
  return `WEBVTT\n\n${body.join('\n')}`;
}

/**
 * Render a sidecar's transcript in one of the export formats.
 * @param {import('./steps/types.js').Sidecar} sidecar
 * @param {string} format - json | srt | vtt | txt
 * @param {string} [path] - Echoed in the JSON export
 * @returns {string}
 */
export function exportTranscript(sidecar, format, path = '') {
  const cues = toCues(sidecar);
  if (format === 'srt') return toSrt(cues);
  if (format === 'vtt') return toVtt(cues);
  if (format === 'txt') return `${cues.map((cue) => cue.text).join('\n')}\n`;
  return JSON.stringify({
    path,
    language: sidecar.language || '',
    provider: sidecar.transcriptProvider || '',
    duration: sidecar.duration ?? null,
    text: cues.map((cue) => cue.text).join(' '),
    words: sidecar.transcript || [],
    segments: sidecar.segments || [],
  });
}
