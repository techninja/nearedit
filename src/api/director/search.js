/**
 * B-roll search — find footage and stills matching a prompt by keyword
 * scoring over tags, description, filename, keyframe tags and transcript.
 * Works with no language model.
 * @module api/director/search
 */

import { matchScore, tokenize } from '#utils/director/keywords.js';

/**
 * @typedef {import('./context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {Object} BrollHit
 * @property {MediaInfo} media
 * @property {number} score
 * @property {string[]} matched - Query words that matched
 * @property {number|null} at - Source time of the best-matching moment, when known
 */

const WEIGHT = { tags: 3, description: 2, name: 2, keyframe: 2, transcript: 1 };

/**
 * The best-matching timed item of a list.
 * @param {string[]} query
 * @param {{ time: number, text: string }[]} items
 * @returns {{ score: number, matched: string[], at: number|null }}
 */
function bestMoment(query, items) {
  let best = { score: 0, matched: [], at: null };
  for (const item of items) {
    const hit = matchScore(query, item.text);
    if (hit.score > best.score) best = { ...hit, at: item.time };
  }
  return best;
}

/**
 * Score one file against the query.
 * @param {MediaInfo} m
 * @param {string[]} query - From `tokenize`
 * @returns {BrollHit}
 */
export function scoreBroll(m, query) {
  const tags = matchScore(query, m.tags.join(' '));
  const description = matchScore(query, m.description);
  const name = matchScore(query, m.relativePath.replace(/\.[^.]+$/, ''));
  const keyframe = bestMoment(
    query,
    m.keyframes.map((k) => ({ time: k.time, text: `${k.tags.join(' ')} ${k.description || ''}` })),
  );
  const spoken = bestMoment(
    query,
    m.segments.map((s) => ({ time: s.start, text: s.text })),
  );
  const score =
    tags.score * WEIGHT.tags +
    description.score * WEIGHT.description +
    name.score * WEIGHT.name +
    keyframe.score * WEIGHT.keyframe +
    spoken.score * WEIGHT.transcript;
  const matched = [tags, description, name, keyframe, spoken].flatMap((h) => h.matched);
  return { media: m, score, matched: [...new Set(matched)], at: keyframe.at ?? spoken.at };
}

/**
 * Rank the project's picture material for a prompt.
 * @param {MediaInfo[]} media
 * @param {string} prompt
 * @param {{ used?: Set<string> }} [opts] - `used`: paths already on the timeline
 * @returns {{ hits: BrollHit[], matched: boolean }} Best first. When nothing matches
 *   (or the prompt is empty) `matched` is false and the unused picture files are
 *   offered in project order instead.
 */
export function searchBroll(media, prompt, opts = {}) {
  const used = opts.used || new Set();
  const query = tokenize(prompt);
  const pictures = media.filter((m) => m.hasVideo);
  const hits = pictures
    .map((m) => {
      const hit = scoreBroll(m, query);
      // Prefer fresh material and real b-roll over a talking head.
      const handicap = (used.has(m.filePath) ? 1 : 0) + (m.kind === 'speech' ? 0.5 : 0);
      return { ...hit, rank: hit.score - handicap };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.rank - a.rank || media.indexOf(a.media) - media.indexOf(b.media));
  if (hits.length) return { hits, matched: true };
  const spare = pictures
    .filter((m) => m.kind !== 'speech')
    .sort((a, b) => Number(used.has(a.filePath)) - Number(used.has(b.filePath)));
  return {
    hits: spare.map((m) => ({ media: m, score: 0, matched: [], at: null })),
    matched: false,
  };
}
