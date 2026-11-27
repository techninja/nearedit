/**
 * Media digest — the token-budgeted description of a project's media that
 * goes into LLM prompts. Every file gets a handle (m1, m2 …) and a line of
 * what is known; transcripts are numbered and windowed to fit the budget.
 * @module api/director/context/digest
 */

import { matchScore, tokenize } from '#utils/director/keywords.js';
import { stamp, windowSegments } from './window.js';

/** @typedef {import('./mediaInfo.js').MediaInfo} MediaInfo */

/** Default size of a digest in characters (roughly 6–8k tokens). */
export const DIGEST_BUDGET = 22000;
const KIND_LABEL = { speech: 'speech', picture: 'picture', music: 'music', still: 'still image' };

/**
 * The always-present lines of a file: what it is and what is known.
 * @param {MediaInfo} m
 * @param {boolean} compact - Leave out shots and trim tags and description
 * @returns {string[]}
 */
export function describeFile(m, compact = false) {
  const facts = [`${m.handle} ${m.type} "${m.relativePath}"`];
  if (m.duration) facts.push(`${stamp(m.duration)}s`);
  if (m.width && m.height) facts.push(`${m.width}x${m.height}`);
  if (m.type === 'video') facts.push(m.hasAudio ? 'with sound' : 'silent');
  facts.push(`[${KIND_LABEL[m.kind]}]`);
  if (m.bpm) facts.push(`${Math.round(m.bpm)} bpm`);
  if (m.global) facts.push('(shared library)');
  if (!m.analysed) facts.push('(not analysed)');
  const lines = [facts.join(' ')];
  if (m.tags.length) lines.push(`  tags: ${m.tags.slice(0, compact ? 6 : 14).join(', ')}`);
  if (m.description) lines.push(`  about: ${m.description.slice(0, compact ? 90 : 260)}`);
  if (!compact && m.scenes.length > 1) {
    const shots = m.scenes.slice(0, 14).map((s, i) => `${i + 1} ${stamp(s.start)}-${stamp(s.end)}`);
    const more = m.scenes.length > 14 ? ` … ${m.scenes.length} shots in all` : '';
    lines.push(`  shots: ${shots.join(', ')}${more}`);
  }
  return lines;
}

/**
 * How relevant a file is to the request, for deciding what to keep when
 * not everything fits.
 * @param {MediaInfo} m
 * @param {string[]} focus
 * @returns {number}
 */
function relevance(m, focus) {
  if (!focus.length) return 0;
  const text = `${m.relativePath} ${m.tags.join(' ')} ${m.description}`;
  return matchScore(focus, text).score;
}

/**
 * Split a character budget between transcripts: a transcript that fits its
 * fair share is shown whole and the unused part is shared among the rest.
 * @param {number[]} needs - Characters each transcript would take in full
 * @param {number} budget
 * @returns {number[]} Characters granted to each
 */
export function shareBudget(needs, budget) {
  const grants = needs.map(() => 0);
  let open = needs.map((_, i) => i);
  let left = Math.max(0, budget);
  while (open.length) {
    const fair = left / open.length;
    const fits = open.filter((i) => needs[i] <= fair);
    if (!fits.length) {
      for (const i of open) grants[i] = Math.floor(fair);
      break;
    }
    for (const i of fits) {
      grants[i] = needs[i];
      left -= needs[i];
    }
    open = open.filter((i) => !fits.includes(i));
  }
  return grants;
}

/**
 * Build the digest.
 * @param {MediaInfo[]} media
 * @param {{ budget?: number, focus?: string }} [opts] - `focus` is the user's request
 * @returns {{ text: string, shown: MediaInfo[], hidden: number }} `shown` are the files
 *   the LLM can see (and therefore pick)
 */
export function buildDigest(media, opts = {}) {
  const budget = opts.budget ?? DIGEST_BUDGET;
  const focus = tokenize(opts.focus || '');
  const cost = (/** @type {string[]} */ lines) => lines.join('\n').length + 1;

  let compact = false;
  let heads = media.map((m) => describeFile(m, false));
  if (heads.reduce((sum, h) => sum + cost(h), 0) > budget * 0.6) {
    compact = true;
    heads = media.map((m) => describeFile(m, true));
  }
  // Too many files even in compact form: keep the most relevant, analysed first.
  const order = media
    .map((m, index) => ({ index, rank: relevance(m, focus) * 10 + (m.analysed ? 1 : 0) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index);
  const keep = new Set();
  let used = 0;
  for (const { index } of order) {
    if (keep.size && used + cost(heads[index]) > budget * 0.7) break;
    keep.add(index);
    used += cost(heads[index]);
  }

  const shown = media.filter((_, i) => keep.has(i));
  const spoken = shown.filter((m) => m.segments.length);
  const needs = spoken.map((m) =>
    m.segments.reduce((sum, s) => sum + Math.min(s.text.length, 240) + 28, 0),
  );
  const grants = shareBudget(needs, budget - used - 80);
  const out = [];
  for (const m of shown) {
    out.push(...describeFile(m, compact));
    const at = spoken.indexOf(m);
    if (at < 0) continue;
    const view = windowSegments(m.segments, grants[at], focus);
    const part = view.shown < view.total ? `, ${view.shown} shown` : '';
    out.push(`  transcript (${view.total} segments${part}):`, ...view.lines);
  }
  const hidden = media.length - shown.length;
  if (hidden) out.push(`(${hidden} more files are not listed)`);
  return { text: out.join('\n'), shown, hidden };
}
