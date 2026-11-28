/**
 * Reading a brief without a language model: every non-empty line is a
 * scene; what follows ` | ` or a dash on a line is its subtitle. List
 * markers people paste along (bullets, numbers, Markdown headings) are
 * dropped.
 * @module api/director/motion/brief
 */

import { MAX_SCENES, MAX_SUBTITLE, MAX_TITLE } from '#utils/director/motion/planSchema.js';
import { DirectorError } from '../errors.js';
import { kindOf } from './kinds.js';

const MARKER = /^(?:[-*•·–—]+|\d{1,3}[.)]|#{1,6})\s+/;
const SEPARATOR = /\s+\|\s+|\s*—\s*|\s+–\s+|\s+--\s+/;
const LEADING_SEPARATOR = /^(?:\||—|–|--)\s*/;
const ONLY_MARKS = /^[-*•·–—|#\s]*$/;
const SENTENCE_END = /(?<=[.!?…])\s+(?=\S)/;
/** A line that says what its scene is: `Intro: …`, `Chapter: …`, `Outro: …`. */
const KIND = /^(intro|opening|chapter|section|outro|closing)\s*:\s+/i;

/**
 * Collapse white space and cut a text that is too long at a word.
 * @param {unknown} text
 * @param {number} limit
 * @returns {string}
 */
export function tidyText(text, limit) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), limit / 2)).trimEnd()}…`;
}

/**
 * One line of a brief as a scene's words. A line that begins `Intro:`,
 * `Chapter:` or `Outro:` (also `Opening:`, `Section:`, `Closing:`) names
 * what its scene is — a card the brand kit draws when the piece follows it.
 * @param {string} line
 * @returns {{ title: string, subtitle?: string, kind?: string }|null} null
 *   when nothing is left to show
 */
export function lineScene(line) {
  const marked = line.trim().replace(MARKER, '').trim().replace(LEADING_SEPARATOR, '');
  const named = marked.match(KIND);
  const text = named ? marked.slice(named[0].length).trim() : marked;
  if (ONLY_MARKS.test(text)) return null;
  const cut = text.match(SEPARATOR);
  const title = cut ? text.slice(0, cut.index) : text;
  const rest = cut ? text.slice(cut.index + cut[0].length) : '';
  /** @type {{ title: string, subtitle?: string, kind?: string }} */
  const scene = { title: tidyText(title, MAX_TITLE) };
  if (named) scene.kind = kindOf(named[1]);
  if (!scene.title) return rest.trim() ? { ...scene, title: tidyText(rest, MAX_TITLE) } : null;
  if (rest.trim()) scene.subtitle = tidyText(rest, MAX_SUBTITLE);
  return scene;
}

/**
 * The scenes a brief describes.
 * @param {string} brief
 * @returns {{ scenes: { title: string, subtitle?: string, kind?: string }[], notes: string[] }}
 */
export function briefScenes(brief) {
  const notes = [];
  let lines = String(brief || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 1 && lines[0].split(/\s+/).length > 8) {
    const sentences = lines[0].split(SENTENCE_END);
    if (sentences.length > 1) {
      lines = sentences;
      notes.push(
        `The brief was a single line — it was split into ${sentences.length} scenes at its ` +
          'sentences. Put each scene on its own line to decide yourself.',
      );
    }
  }
  const all = lines.map(lineScene).filter(Boolean);
  if (all.length > MAX_SCENES) {
    notes.push(`Only the first ${MAX_SCENES} of ${all.length} lines were used.`);
  }
  const scenes = all.slice(0, MAX_SCENES);
  const long = lines.some((line) => line.length > MAX_TITLE + MAX_SUBTITLE);
  if (
    long ||
    scenes.some((scene) => scene.title.endsWith('…') && scene.title.length >= MAX_TITLE)
  ) {
    notes.push('A very long line was shortened to fit on screen.');
  }
  return { scenes, notes };
}

/**
 * Refuse a `motion_piece` directive whose brief holds nothing to show, so
 * it is a 422 answer before a job starts.
 * @param {import('#utils/director/directive.js').Directive} directive
 * @throws {DirectorError} 422
 */
export function checkBrief(directive) {
  if (briefScenes(directive.prompt).scenes.length) return;
  throw new DirectorError('Write a brief for the piece first', {
    status: 422,
    detail:
      'One line per scene; put a subtitle after " | ". For example: ' +
      '"Made from nothing | no footage, only layers".',
    fields: { prompt: 'The brief is empty' },
  });
}
