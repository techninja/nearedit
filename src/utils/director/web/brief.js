/**
 * Reading a brief without a language model: every line is one stop,
 * written the way one would tell a colleague — "click Pricing", "type
 * hello@example.com into Email | sign up in seconds". What follows ` | `
 * or a dash is the caption. A line that is not an instruction is a place
 * to look at: the page scrolls to what it names and the line is its
 * caption. A line that starts with `#` (or `Title:`) is the title card.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § The brief. Isomorphic and pure.
 * @module utils/director/web/brief
 */

import { MAX_ON, MAX_SAY, MAX_STOPS, MAX_TEXT, MAX_TITLE } from './planSchema.js';
import { READERS } from './readers.js';
import { splitCaption, tidy } from './words.js';

/** @typedef {{ do: string, on?: string, text?: string, say?: string }} Stop */

const MARKER = /^(?:[-*•·]+|\d{1,3}[.)])\s+/;
const LEAD = /^(?:(?:and\s+then|and|then|next|now|first|finally|lastly|after\s+that)[,:]?\s+)+/i;
const TITLE = /^(?:#{1,6}\s*|title\s*:\s*)(\S.*)$/i;
const LEADING_SEPARATOR = /^(?:\||—|–|--)\s*/;
const THEN = /\s*;\s+|,?\s+and\s+then\s+|[,.]\s+then\s+/i;

/**
 * One instruction as a stop.
 * @param {string} text - Without list marker and caption
 * @returns {{ do: string, on?: string, text?: string }|null} null for
 *   something that is not an instruction
 */
export function readInstruction(text) {
  const clean = text
    .trim()
    .replace(LEAD, '')
    .replace(/[.!;,]+$/, '')
    .trim();
  if (!clean) return null;
  for (const reader of READERS) {
    const stop = reader(clean);
    if (stop) return stop;
  }
  return null;
}

/**
 * One line of a brief as a stop.
 * @param {string} line
 * @returns {{ stop: Stop, look: boolean }|null} `look`: the line is not an
 *   instruction but a place to look at; null when nothing is left to read
 */
export function readLine(line) {
  const text = line.trim().replace(MARKER, '');
  if (!/[\p{L}\p{N}]/u.test(text)) return null;
  // A line that opens with the separator is a caption and nothing else.
  const alone = LEADING_SEPARATOR.test(text);
  const cut = splitCaption(text);
  const head = alone ? '' : cut.head;
  const caption = alone ? text.replace(LEADING_SEPARATOR, '') : cut.caption;
  const say = tidy(caption, MAX_SAY);
  const read = readInstruction(head);
  if (read) {
    /** @type {Stop} */
    const stop = { do: read.do };
    if (read.on) stop.on = tidy(read.on, MAX_ON);
    if (read.text) stop.text = read.text.slice(0, MAX_TEXT);
    if (say) stop.say = say;
    return { stop, look: false };
  }
  const words = tidy(head.replace(/[.!]+$/, ''), MAX_ON);
  if (!words && !say) return null;
  // A caption with nothing in front of it is shown while the page rests.
  if (!words) return { stop: { do: 'wait', say }, look: false };
  return { stop: { do: 'scroll', on: words, say: say || tidy(head, MAX_SAY) }, look: true };
}

/**
 * A stop in a few words, for notes: `click “Pricing”`, `type “hello” into “Email”`.
 * @param {Stop} stop
 * @param {boolean} [look] - The stop came from a line that is not an instruction
 * @returns {string}
 */
export function describeStop(stop, look = false) {
  const on = stop.on ? `“${stop.on}”` : '';
  const text = stop.text ? `“${stop.text}”` : '';
  if (look) return `look at ${on}`;
  if (stop.do === 'type') return `type ${text}${on ? ` into ${on}` : ''}`;
  if (stop.do === 'select') return `select ${text} in ${on}`;
  if (stop.do === 'press') return `press ${stop.text}`;
  if (stop.do === 'goto') return `go to ${stop.text}`;
  if (stop.do === 'wait') return stop.text ? `wait ${stop.text} s` : 'wait';
  if (stop.do === 'focus') return `zoom in on ${on}`;
  if (stop.do === 'scroll') {
    const by = stop.text ? ` ${stop.text} px` : '';
    return /^(top|bottom)$/.test(stop.on) ? `scroll to the ${stop.on}` : `scroll ${on}${by}`;
  }
  return [stop.do, text && stop.do !== 'highlight' ? text : '', on].filter(Boolean).join(' ');
}

/**
 * The plan a brief describes.
 * @param {string} brief
 * @returns {{ title: string, subtitle: string, stops: Stop[], notes: string[] }}
 *   No stops for an empty brief: the page is then toured
 */
export function briefStops(brief) {
  const notes = [];
  let title = '';
  let subtitle = '';
  /** @type {{ stop: Stop, look: boolean }[]} */
  const read = [];
  for (const raw of String(brief || '').split(/\r?\n/)) {
    const line = raw.trim().replace(MARKER, '');
    const heading = TITLE.exec(line);
    if (heading && !title) {
      const { head, caption } = splitCaption(heading[1]);
      title = tidy(head, MAX_TITLE);
      subtitle = tidy(caption, MAX_SAY);
      continue;
    }
    // "click A, then click B" is two stops; a line that is no instruction stays whole.
    const parts = line.split(THEN).filter(Boolean);
    const several = parts.length > 1 && parts.every((part) => readLine(part)?.look === false);
    for (const part of several ? parts : [line]) {
      const found = readLine(part);
      if (found) read.push(found);
    }
  }
  if (read.length > MAX_STOPS)
    notes.push(`Only the first ${MAX_STOPS} of ${read.length} lines were used.`);
  const used = read.slice(0, MAX_STOPS);
  if (used.length) {
    const list = used.map(({ stop, look }, i) => `${i + 1} ${describeStop(stop, look)}`);
    notes.push(
      `The brief was read as ${used.length === 1 ? 'one stop' : `${used.length} stops`}: ${list.join(' · ')}.`,
    );
  }
  const looks = used.filter(({ look }) => look).length;
  if (looks) {
    notes.push(
      `${looks === 1 ? 'One line is' : `${looks} lines are`} not an instruction: the page ` +
        'scrolls to the heading each matches best, and the line is shown as its caption.',
    );
  }
  return { title, subtitle, stops: used.map(({ stop }) => stop), notes };
}
