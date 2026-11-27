/**
 * Media search over filenames and sidecars: tags, description, keyframes,
 * transcript and text content. Every query term must be found somewhere in
 * a file; results say where, with timestamps, instead of returning sidecars.
 * @module api/intelligence/search
 */

import { scanProject } from '../lib/mediaScan.js';
import { readSidecar } from '../lib/sidecar.js';
import { excerpt, parseQuery } from './searchTerms.js';
import { toCues } from './transcriptExport.js';

const MAX_PER_FIELD = 5;
const WEIGHTS = { filename: 3, tag: 3, description: 2, keyframe: 1, transcript: 1, content: 1 };

/**
 * @typedef {Object} SearchMatch
 * @property {'filename'|'tag'|'description'|'keyframe'|'transcript'|'content'} field
 * @property {string} text - The tag, or a short excerpt around the hit
 * @property {number} [start] - Seconds (transcript cue, subtitle cue)
 * @property {number} [end]
 * @property {number} [time] - Seconds of the keyframe, or of the first matching word
 */

/**
 * Match one file against the query terms.
 * @param {import('../lib/mediaScan.js').MediaEntry} entry
 * @param {import('./steps/types.js').Sidecar|null} sidecar
 * @param {string[]} terms - Lower-case
 * @returns {{ score: number, matchCount: number, matches: SearchMatch[] }|null}
 */
export function matchFile(entry, sidecar, terms) {
  const found = new Set();
  /** @type {SearchMatch[]} */
  const matches = [];
  let score = 0;
  let matchCount = 0;
  /**
   * @param {SearchMatch['field']} field
   * @param {{ text: string, make: () => Omit<SearchMatch, 'field'> }[]} candidates
   */
  const scan = (field, candidates) => {
    const hits = [];
    for (const candidate of candidates) {
      const lower = candidate.text.toLowerCase();
      const present = terms.filter((t) => lower.includes(t));
      if (!present.length) continue;
      present.forEach((t) => found.add(t));
      hits.push({ count: present.length, make: candidate.make });
    }
    matchCount += hits.length;
    score += WEIGHTS[field] * hits.reduce((sum, hit) => sum + hit.count, 0);
    hits.sort((a, b) => b.count - a.count); // stable: the best, then the earliest
    for (const hit of hits.slice(0, MAX_PER_FIELD)) matches.push({ field, ...hit.make() });
  };

  scan('filename', [{ text: entry.relativePath, make: () => ({ text: entry.relativePath }) }]);
  if (sidecar) {
    scan(
      'tag',
      (sidecar.tags || []).map((tag) => ({
        text: String(tag),
        make: () => ({ text: String(tag) }),
      })),
    );
    const description = String(sidecar.description || '');
    scan('description', [
      { text: description, make: () => ({ text: excerpt(description, terms) }) },
    ]);
    scan(
      'keyframe',
      (sidecar.keyframes || []).map((frame) => {
        const text = [frame.description, ...(frame.tags || [])].filter(Boolean).join(', ');
        return { text, make: () => ({ text: excerpt(text, terms), time: frame.time }) };
      }),
    );
    const words = sidecar.transcript || [];
    scan(
      'transcript',
      toCues(sidecar).map((cue) => ({
        text: cue.text,
        make: () => {
          const said = words.find(
            (w) =>
              w.start >= cue.start - 0.01 &&
              w.end <= cue.end + 0.01 &&
              terms.some((t) => String(w.word).toLowerCase().includes(t)),
          );
          const base = { text: excerpt(cue.text, terms, 120), start: cue.start, end: cue.end };
          return { ...base, time: said ? said.start : cue.start };
        },
      })),
    );
    if (sidecar.type === 'text') {
      scan(
        'content',
        (sidecar.sections || []).map((section) => {
          const text = [section.heading, section.text].filter(Boolean).join(' — ');
          const timing =
            section.start === undefined ? {} : { start: section.start, end: section.end };
          return { text, make: () => ({ text: excerpt(text, terms), ...timing }) };
        }),
      );
    }
  }
  return terms.every((t) => found.has(t)) ? { score, matchCount, matches } : null;
}

/**
 * Search a project's media.
 * @param {string} projectId
 * @param {string} query
 * @param {{ limit?: number }} [options]
 * @returns {{ data: object[], total: number }}
 */
export function searchProject(projectId, query, options = {}) {
  const terms = parseQuery(query);
  if (!terms.length) return { data: [], total: 0 };
  const results = [];
  for (const entry of scanProject(projectId)) {
    const sidecar = readSidecar(entry.filePath);
    const hit = matchFile(entry, sidecar, terms);
    if (!hit) continue;
    const { filename, filePath, relativePath, type, global } = entry;
    const duration = sidecar?.duration ?? null;
    results.push({ filename, filePath, relativePath, type, global, duration, ...hit });
  }
  results.sort((a, b) => b.score - a.score);
  return { data: results.slice(0, options.limit || 50), total: results.length };
}
