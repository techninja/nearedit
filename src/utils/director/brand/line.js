/**
 * A brand element said in a line, the way one would tell a colleague:
 * `lower third: Ada Lovelace, CEO, at 0:12` · `chapter: The river at 1:05` ·
 * `title: A Day at the Park | and what we found` · `stinger at 0:30` · `bug`.
 * The name before the colon is an element of the kit — by its id, its
 * label or a common word for it; what follows fills its slots in their
 * order; a time after `at` says where.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Elements in a plan.
 * Isomorphic and pure.
 * @module utils/director/brand/line
 */

/** A closing `at 0:12`, `at 75`, `at 12.5s`, with or without a comma before it. */
const AT = /(?:^|[\s,;])at\s+(\d+(?::\d{1,2}){0,2}(?:\.\d+)?)\s*s?\s*$/i;
/** What separates the text of one slot from the next. */
const BARS = /\s+\|\s+|\s+—\s+|\s+–\s+|\s+--\s+/;
const QUOTES = /^["“”'‘’]+|["“”'‘’]+$/g;

/**
 * A time as people write one.
 * @param {unknown} text - `0:12`, `1:05:30`, `75`, `12.5s`; a number is taken as seconds
 * @returns {number|null} Seconds; null for anything else
 */
export function clock(text) {
  if (typeof text === 'number') return Number.isFinite(text) && text >= 0 ? text : null;
  const found = /^\s*(\d+(?::\d{1,2}){0,2}(?:\.\d+)?)\s*s?\s*$/i.exec(String(text ?? ''));
  if (!found) return null;
  return found[1].split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
}

/**
 * The parts of a line, before any kit is asked what they mean.
 * @param {unknown} line
 * @returns {{ name: string, rest: string, at: number|null }|null} `name`: what
 *   stands before the colon (the whole line when there is none); null for
 *   an empty line
 */
export function parseLine(line) {
  let text = String(line ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:[-*•·]+|\d{1,3}[.)])\s+/, '');
  if (!text) return null;
  const timed = AT.exec(text);
  const at = timed ? clock(timed[1]) : null;
  if (timed) text = text.slice(0, timed.index).replace(/[\s,;]+$/, '');
  const colon = text.indexOf(':');
  const name = (colon < 0 ? text : text.slice(0, colon)).trim();
  const rest = colon < 0 ? '' : text.slice(colon + 1).trim();
  return name ? { name, rest, at } : null;
}

/**
 * The text of a line shared out among the slots of an element, in their
 * order. ` | ` and a spaced dash always separate; a comma does when the
 * first slot is a name ("Ada Lovelace, CEO"). What is left over stays in
 * the last slot.
 * @param {string} rest
 * @param {string[]} slots - The element's slot names, in order
 * @returns {Record<string, string>}
 */
export function splitSlots(rest, slots) {
  const text = String(rest || '').trim();
  if (!text || !slots.length) return {};
  let parts = text.split(BARS);
  if (parts.length === 1 && slots[0] === 'name' && slots.length > 1) parts = text.split(/\s*,\s*/);
  const tidy = parts.map((part) => part.trim().replace(QUOTES, '').trim()).filter(Boolean);
  const head = tidy.slice(0, slots.length - 1);
  const tail = tidy.slice(slots.length - 1).join(', ');
  return Object.fromEntries(
    [...head, tail].flatMap((value, i) => (value ? [[slots[i], value]] : [])),
  );
}
