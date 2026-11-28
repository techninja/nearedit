/**
 * What caption grouping needs to know about text: how a word is shown
 * (capitals, punctuation), how wide it counts, whether it ends a sentence
 * or a clause, and which scripts are written without spaces.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Groups and timing.
 * @module utils/captions/text
 */

import { graphemes } from '#utils/compose/text/wrap.js';

/** Scripts written without spaces between words: grouped by characters. */
const NO_SPACE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
/** Characters about twice as wide as a Latin letter. */
const WIDE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\u3000-\u303f\uff01-\uff60]/u;
const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/;
const CLOSERS = '["\'”’»)\\]]*$';
const SENTENCE_END = new RegExp(`[.!?…。！？]${CLOSERS}`);
const CLAUSE_END = new RegExp(`[,;:、，；：—–]${CLOSERS}`);
/** A token that belongs to the word before it: `,` `'s` `%` `)`. */
const ATTACHES = /^(?:[.,!?;:…)\]}'’"”»。、，！？；：%—–-]+|['’]\p{L}{1,2})$/u;
/** Where two unspaced words meet, no space is written. */
const UNSPACED_EDGE = new RegExp(`${NO_SPACE.source}|[\\u3000-\\u303f\\uff01-\\uff60]`, 'u');
const LEADING = /^["“”„«»‹›'‘’([{¿¡…]+/;
const TRAILING = /[.,!?;:…‥。、，！？；："“”„«»‹›'‘’)\]}—–-]+$/;
/** Words that belong to what follows them: English, then Spanish, French, German, Italian. */
const LEANING = new Set(
  (
    'a an the and or but nor so of to in on at by for from with as than if that this these ' +
    'those my your his her its our their is are was were am be i we you he she it they not ' +
    'el la los las un una y o de del al en con por para que mi tu su ' +
    'le les une et ou du des au aux dans sur pour avec je il elle nous vous ils ' +
    'der die das den dem ein eine und oder zu im am von mit für ich wir ihr sie ' +
    'lo gli e di da per che io noi'
  ).split(' '),
);
/** Ends in a full stop without ending a sentence. */
const ABBREVIATION = /^(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|(?:\p{L}\.)*\p{L})\.$/iu;

/**
 * @param {string} text
 * @returns {boolean} True when the text has characters of a script written without spaces
 */
export const isUnspaced = (text) => NO_SPACE.test(text);

/**
 * @param {string} before - The word before
 * @param {string} text
 * @returns {boolean} True when the two are written without a space between them
 */
export const joins = (before, text) =>
  UNSPACED_EDGE.test(before.slice(-2)) && UNSPACED_EDGE.test(text.slice(0, 2));

/**
 * @param {string} text
 * @returns {boolean} True when the text reads right to left
 */
export const isRtl = (text) => RTL.test(text);

/**
 * @param {string} text - A word as transcribed
 * @returns {boolean} True for a token that is written onto the word before it
 */
export const attaches = (text) => ATTACHES.test(text);

/**
 * @param {string} text - A word as transcribed
 * @returns {boolean} True when a sentence ends with this word
 */
export const endsSentence = (text) => SENTENCE_END.test(text) && !ABBREVIATION.test(text);

/**
 * @param {string} text - A word as transcribed
 * @returns {boolean} True when a clause ends with this word: a good place to break
 */
export const endsClause = (text) => CLAUSE_END.test(text);

/**
 * @param {string} text - A word as transcribed
 * @returns {boolean} True for a word that leans on the one after it — an
 *   article, a preposition, a conjunction, a pronoun before its verb — so a
 *   group should not end with it. Known for a handful of languages; in any
 *   other, no word leans
 */
export const leans = (text) => LEANING.has(text.toLowerCase().replace(/[^\p{L}']/gu, ''));

/**
 * @param {string} text
 * @returns {boolean} True when the text has a letter or a digit (false for
 *   an emoji or a symbol on its own)
 */
export const hasLetter = (text) => /[\p{L}\p{N}]/u.test(text);

/**
 * How much room a text takes, in Latin letters: wide characters count two.
 * @param {string} text
 * @returns {number}
 */
export function charCount(text) {
  let count = 0;
  for (const char of graphemes(text)) count += WIDE.test(char) ? 2 : 1;
  return count;
}

/**
 * A word as the style shows it.
 * @param {string} text - As transcribed
 * @param {{ case: string, punctuation: string }} style
 * @returns {string} '' when nothing is left to show
 */
export function shownText(text, style) {
  let shown = text;
  if (style.punctuation === 'strip') {
    shown = shown.replace(LEADING, '').replace(TRAILING, '').trim();
  }
  if (style.case === 'upper') return shown.toUpperCase();
  return style.case === 'lower' ? shown.toLowerCase() : shown;
}

/**
 * Cut a word of an unspaced script into the pieces a caption marks one by
 * one: each character on its own, with Latin letters and digits kept
 * together and punctuation left on the character before it.
 * @param {string} text
 * @returns {string[]} At least one piece
 */
export function unspacedPieces(text) {
  /** @type {string[]} */
  const pieces = [];
  let latin = false;
  let bare = true; // the piece being built has no letter yet: it takes the next one
  for (const char of graphemes(text)) {
    const own = NO_SPACE.test(char);
    const letter = own || /[\p{L}\p{N}]/u.test(char);
    const starts = !pieces.length || (!bare && (own || (letter && !latin)));
    if (starts) pieces.push(char);
    else pieces[pieces.length - 1] += char;
    if (letter) [latin, bare] = [!own, false];
    else if (starts) bare = true;
  }
  return pieces.length ? pieces : [text];
}
