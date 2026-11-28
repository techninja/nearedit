/**
 * Reading the request of a brand pass without a language model: the form's
 * title, subtitle and speakers, and the lines of the brief — speakers and
 * chapters as lists, single elements as lines ("lower third: Ada Lovelace,
 * CEO, at 0:12"), and parts switched off in plain words ("no bug").
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The brand pass.
 * Isomorphic and pure.
 * @module utils/director/brand/request
 */

import { elementFor } from './elementClip.js';
import { normalizeItem, resolveItem } from './items.js';
import { listOf, readChapter, readSpeaker } from './people.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */

/** The parts of a brand pass, each a switch of its form. */
export const PARTS = ['intro', 'outro', 'bug', 'names', 'stingers', 'captions', 'restyle'];

/**
 * @typedef {{ name: string, role: string, at: number|null }} Speaker
 * @typedef {{ title: string, at: number|null }} Chapter
 * @typedef {Object} BrandRequest
 * @property {Record<string, boolean>} parts - `PARTS`, and `chapters`
 * @property {string} title
 * @property {string} subtitle
 * @property {{ title: string, text: string }|null} closing - What the outro
 *   says, when the brief says it (`outro: Thanks for watching | example.com`)
 * @property {Speaker[]} speakers
 * @property {Chapter[]} chapters
 * @property {NonNullable<ReturnType<typeof resolveItem>>[]} items - Other
 *   elements asked for by a line, each at a time
 * @property {string[]} notes - What could not be read
 */

/** Words that switch a part off: "no intro", "without the logo", "skip stingers". */
const OFF =
  /\b(?:no|without|skip)\s+(?:the\s+|an?\s+|any\s+)?([a-z][a-z -]{1,24}?)(?=\s*(?:[,;.]|$|\band\b|\bor\b))/gi;
const PART_WORDS = {
  intro: ['intro', 'opening', 'bumper'],
  outro: ['outro', 'closing', 'end card'],
  bug: ['bug', 'logo', 'logo bug', 'watermark'],
  names: ['names', 'name', 'lower third', 'lower thirds', 'speakers'],
  stingers: ['stinger', 'stingers', 'wipe', 'wipes', 'transitions'],
  chapters: ['chapter', 'chapters', 'chapter cards', 'chapter card'],
  captions: ['captions', 'caption style', 'caption', 'subtitles'],
  restyle: ['restyle', 'update', 'updating', 'restyling'],
};

/**
 * Read a request.
 * @param {Record<string, any>} params - The form: `title`, `subtitle`,
 *   `speakers`, and a switch per part
 * @param {string} prompt - The brief
 * @param {Kit} kit
 * @returns {BrandRequest}
 */
export function readBrandRequest(params, prompt, kit) {
  /** @type {BrandRequest} */
  const request = {
    parts: Object.fromEntries([...PARTS, 'chapters'].map((part) => [part, params[part] !== false])),
    title: String(params.title || '').trim(),
    subtitle: String(params.subtitle || '').trim(),
    closing: null,
    speakers: listOf(params.speakers, readSpeaker),
    chapters: [],
    items: [],
    notes: [],
  };
  request.parts.chapters = request.parts.stingers;
  for (const raw of String(prompt || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let switched = false;
    for (const [, words] of line.matchAll(OFF)) {
      const part = Object.keys(PART_WORDS).find((key) => PART_WORDS[key].includes(words.trim()));
      if (part) request.parts[part] = false;
      switched ||= Boolean(part);
    }
    if (switched) continue;
    const list = /^(speakers?|chapters?)\s*:\s*(.+)$/i.exec(line);
    if (list && /^speaker/i.test(list[1])) request.speakers.push(...listOf(list[2], readSpeaker));
    else if (list) request.chapters.push(...listOf(list[2], readChapter));
    else readLine(line, kit, request);
  }
  return request;
}

/**
 * One line of the brief that names an element.
 * @param {string} line
 * @param {Kit} kit
 * @param {BrandRequest} request - Added to
 */
function readLine(line, kit, request) {
  const item = resolveItem(normalizeItem(line), kit);
  if (!item) return void request.notes.push(`“${line}” was not understood — left out.`);
  const { slots } = item;
  if (item.id === elementFor(kit, 'lowerThird')) {
    if (slots.name)
      request.speakers.push({ name: slots.name, role: slots.role || '', at: item.at });
  } else if (item.id === elementFor(kit, 'intro')) {
    if (slots.title) request.title = slots.title;
    if (slots.subtitle) request.subtitle = slots.subtitle;
  } else if (item.id === elementFor(kit, 'outro')) {
    request.closing = { title: slots.title || '', text: slots.text || '' };
  } else if (item.id === elementFor(kit, 'chapter')) {
    if (slots.title) request.chapters.push({ title: slots.title, at: item.at });
  } else if (item.id === elementFor(kit, 'bug')) request.parts.bug = true;
  else if (item.at === null) {
    request.notes.push(`“${line}” says no time (… at 0:12) — left out.`);
  } else request.items.push(item);
}
