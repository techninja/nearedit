/**
 * Parser for whisper.cpp's "full" JSON (`whisper-cli -ojf`), which lists the
 * tokens of every segment with millisecond offsets and probabilities. Tokens
 * are sub-word pieces: " Amer" + "icans" + "," is one word.
 * @module api/intelligence/transcription/whisperCppParse
 */

import { UNSPACED, languageCode } from './languages.js';
import { round3 } from '../steps/types.js';

/** @typedef {import('./normalize.js').Word} Word */

const SPECIAL_TOKEN = /^\[_.*\]$/; // [_BEG_], [_TT_150], [_EOT_]…
const NON_SPEECH = /^[[(][^\])]*[\])]$/; // "[BLANK_AUDIO]", "(music)"
const PUNCTUATION = /^[\p{P}\p{S}]+$/u;

/**
 * Group the tokens of one segment into words.
 * @param {any[]} tokens
 * @param {boolean} unspaced - Language has no spaces: every token is a word
 * @returns {Word[]}
 */
export function tokensToWords(tokens, unspaced = false) {
  /** @type {{ text: string, start: number, end: number, p: number[] }[]} */
  const groups = [];
  for (const token of tokens || []) {
    const text = String(token?.text ?? '');
    const from = Number(token?.offsets?.from);
    const to = Number(token?.offsets?.to);
    if (!text.trim() || SPECIAL_TOKEN.test(text) || !Number.isFinite(from)) continue;
    const last = groups[groups.length - 1];
    const glue = last && (PUNCTUATION.test(text.trim()) || (!unspaced && !/^\s/.test(text)));
    if (glue) {
      last.text += text.trim();
      last.end = Math.max(last.end, to);
      last.p.push(Number(token.p));
    } else {
      groups.push({ text: text.trim(), start: from, end: Math.max(from, to), p: [Number(token.p)] });
    }
  }
  return groups.map((g) => {
    /** @type {Word} */
    const word = { word: g.text, start: round3(g.start / 1000), end: round3(g.end / 1000) };
    const known = g.p.filter((p) => Number.isFinite(p));
    if (known.length) {
      word.probability = Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 1000) / 1000;
    }
    return word;
  });
}

/**
 * Convert a whisper.cpp JSON document into a transcript.
 * @param {any} json - Parsed `-ojf` output
 * @returns {import('./normalize.js').Transcript}
 */
export function parseWhisperCppJson(json) {
  const language = languageCode(json?.result?.language || json?.params?.language);
  const words = [];
  const segments = [];
  for (const entry of json?.transcription || []) {
    const text = String(entry?.text ?? '').trim();
    const start = Number(entry?.offsets?.from) / 1000;
    const end = Number(entry?.offsets?.to) / 1000;
    if (!text || NON_SPEECH.test(text) || PUNCTUATION.test(text)) continue; // "♪♪", "[MUSIC]"
    if (!Number.isFinite(start)) continue;
    segments.push({ id: segments.length, start: round3(start), end: round3(end), text });
    words.push(...tokensToWords(entry.tokens, UNSPACED.has(language)));
  }
  return { words, segments, language };
}
