/**
 * MediaInfo — one analysed (or merely probed) media file as the director
 * sees it: sidecar fields normalised, gaps filled with safe defaults, and
 * the file classified as speech-led, picture-only, music or a still.
 * Sidecar reference: docs/app-spec/API.md § Sidecar fields.
 * @module api/director/context/mediaInfo
 */

import { deriveSegments } from '#utils/director/phrases.js';
import { speechRuns } from '#utils/director/tighten.js';

/**
 * @typedef {import('#utils/director/speech.js').Word} Word
 * @typedef {import('#utils/director/speech.js').Span} Span
 * @typedef {'speech'|'picture'|'music'|'still'} MediaKind
 * @typedef {Object} MediaInfo
 * @property {string} handle - Short id used in prompts and plans: m1, m2 …
 * @property {string} filePath - Absolute path
 * @property {string} filename
 * @property {string} relativePath
 * @property {'video'|'audio'|'image'} type
 * @property {boolean} global - From a global media folder
 * @property {boolean} analysed - A fresh sidecar exists
 * @property {number|null} duration - Seconds; null when unknown (always null for images)
 * @property {number} width - 0 when unknown
 * @property {number} height
 * @property {boolean} hasAudio
 * @property {boolean} hasVideo
 * @property {Word[]} words
 * @property {{ start: number, end: number, text: string }[]} segments - Numbered from 1 in prompts
 * @property {string[]} tags
 * @property {string} description
 * @property {{ time: number, tags: string[], description?: string }[]} keyframes
 * @property {number[]} beats - Seconds, ascending
 * @property {number|null} bpm
 * @property {Span[]} scenes
 * @property {Span[]} silences
 * @property {MediaKind} kind
 */

const SPEECH_TAGS = ['speech', 'interview', 'voiceover', 'narration', 'talking head', 'dialogue'];
const PICTURE_TAGS = ['b-roll', 'broll'];
const SPEECH_NAME = /(voice|narrat|interview|podcast|speech|talk|lecture|dialog|memo|\bvo\b)/i;

const list = (/** @type {any} */ value) => (Array.isArray(value) ? value : []);
const spans = (/** @type {any} */ value) =>
  list(value)
    .filter((s) => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);

/**
 * Fraction of a file's length that is speech, from words or segments.
 * @param {{ words: Word[], segments: Span[], duration: number|null }} info
 * @returns {number} 0..1
 */
export function speechCoverage(info) {
  const last = info.words.at(-1)?.end ?? info.segments.at(-1)?.end ?? 0;
  const length = info.duration || last;
  if (!(length > 0)) return 0;
  const runs = info.words.length
    ? speechRuns(info.words, 0, length + 1, { threshold: 1, padding: 0 })
    : info.segments;
  const spoken = runs.reduce((sum, r) => sum + (r.end - r.start), 0);
  return Math.min(1, spoken / length);
}

/**
 * Decide what a file is for. Tags override the heuristics: tag a file
 * `music`, `speech` (or interview, voiceover, narration) or `b-roll`.
 * @param {Omit<MediaInfo, 'kind'|'handle'>} info
 * @returns {MediaKind}
 */
export function classifyMedia(info) {
  if (info.type === 'image') return 'still';
  const tags = info.tags.map((t) => t.toLowerCase());
  if (tags.includes('music')) return info.hasAudio ? 'music' : 'picture';
  if (tags.some((t) => SPEECH_TAGS.includes(t))) return 'speech';
  if (info.type === 'video' && tags.some((t) => PICTURE_TAGS.includes(t))) return 'picture';
  const coverage = speechCoverage(info);
  if (info.type === 'video') return coverage >= 0.3 ? 'speech' : 'picture';
  if (coverage >= 0.25) return 'speech';
  const unanalysed = !info.words.length && !info.segments.length && !info.beats.length;
  return unanalysed && SPEECH_NAME.test(info.filename) ? 'speech' : 'music';
}

/**
 * Build a MediaInfo from a scan entry, its sidecar and/or a live probe.
 * @param {import('../../lib/mediaScan.js').MediaEntry} entry
 * @param {import('../../lib/sidecar.js').Sidecar|null} sidecar - Fresh sidecar, or null
 * @param {Record<string, any>|null} [probed] - `lib/ffmpeg.js` probe() result
 * @returns {MediaInfo}
 */
export function toMediaInfo(entry, sidecar, probed = null) {
  const s = /** @type {Record<string, any>} */ ({ ...(probed || {}), ...(sidecar || {}) });
  const type = /** @type {'video'|'audio'|'image'} */ (entry.type);
  const [resW, resH] = String(s.resolution || '')
    .split('x')
    .map(Number);
  const turned = Math.abs(Number(s.rotation) || 0) % 180 === 90;
  const width = Number(s.width) || resW || 0;
  const height = Number(s.height) || resH || 0;
  const words = list(s.transcript)
    .filter((w) => Number.isFinite(w?.start) && Number.isFinite(w?.end))
    .sort((a, b) => a.start - b.start);
  const segments = spans(s.segments).map((seg) => ({
    ...seg,
    text: String(seg.text || '').trim(),
  }));
  const duration = Number(s.duration);
  const info = {
    handle: '',
    filePath: entry.filePath,
    filename: entry.filename,
    relativePath: entry.relativePath,
    type,
    global: entry.global,
    analysed: Boolean(sidecar),
    duration: type !== 'image' && duration > 0 ? duration : null,
    width: turned ? height : width,
    height: turned ? width : height,
    hasAudio: type === 'audio' ? s.hasAudio !== false : type === 'video' && s.hasAudio === true,
    hasVideo: type !== 'audio',
    words,
    segments: segments.length ? segments : deriveSegments(words),
    tags: list(s.tags).map(String),
    description: String(s.description || ''),
    keyframes: list(s.keyframes).filter((k) => Number.isFinite(k?.time)),
    beats: list(s.beats)
      .filter(Number.isFinite)
      .sort((a, b) => a - b),
    bpm: Number(s.bpm) > 0 ? Number(s.bpm) : null,
    scenes: spans(s.scenes),
    silences: spans(s.silences),
  };
  return { ...info, kind: classifyMedia(info) };
}
