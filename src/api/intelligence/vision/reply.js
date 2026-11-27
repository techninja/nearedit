/**
 * The tagging prompt and the defensive side of vision tagging: small local
 * models wrap JSON in prose or code fences, forget quotes, or answer in plain
 * sentences. Whatever comes back is turned into `{ description, tags }`.
 * @module api/intelligence/vision/reply
 */

import { jsonrepair } from 'jsonrepair';

export const TAG_PROMPT = [
  'You are logging footage for a video editor. Look at this frame and describe it.',
  'Reply with ONLY a JSON object, no other text:',
  '{"description": "<one sentence: who or what is visible, where, doing what>",',
  ' "tags": ["<4 to 8 short lowercase tags: subjects, setting, action, shot type, mood>"]}',
].join('\n');

const MAX_TAGS_PER_FRAME = 12;
const MAX_FILE_TAGS = 20;
const MAX_DESCRIPTION = 600;

/**
 * @param {unknown} value - Array of tags, or one comma-separated string
 * @returns {string[]} Clean, lower-case, de-duplicated
 */
export function cleanTags(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]/) : [];
  const tags = [];
  for (const item of list) {
    const tag = String(item ?? '')
      .toLowerCase()
      .replace(/^[\s#"'*-]+|[\s"'.*]+$/g, '')
      .replace(/\s+/g, ' ');
    if (tag && tag.length <= 40 && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, MAX_TAGS_PER_FRAME);
}

/**
 * Parse a model reply into a description and tags.
 * @param {unknown} reply - Raw text from the model
 * @returns {{ description: string, tags: string[] }}
 */
export function parseReply(reply) {
  const text = String(reply ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  const from = text.indexOf('{');
  const to = text.lastIndexOf('}');
  if (from >= 0) {
    const candidate = to > from ? text.slice(from, to + 1) : text.slice(from);
    for (const attempt of [(s) => s, jsonrepair]) {
      try {
        const data = JSON.parse(attempt(candidate));
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const description = String(data.description ?? data.caption ?? data.summary ?? '').trim();
          return { description, tags: cleanTags(data.tags ?? data.keywords) };
        }
      } catch (err) {
        if (attempt === jsonrepair) console.warn('[vision] unparseable reply:', err.message);
      }
    }
  }
  // No JSON at all: keep the prose as the description rather than lose it.
  return { description: text.replace(/\s+/g, ' ').slice(0, 300), tags: [] };
}

/**
 * @typedef {Object} Keyframe
 * @property {number} time - Seconds into the file (0 for stills)
 * @property {string[]} tags
 * @property {string} description
 */

/**
 * Combine per-frame results into file-level tags (most frequent first) and a
 * description (the distinct frame descriptions, in order).
 * @param {Keyframe[]} keyframes
 * @returns {{ tags: string[], description: string, keyframes: Keyframe[] }}
 */
export function aggregate(keyframes) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const frame of keyframes) {
    for (const tag of frame.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  // Map keeps insertion order, and sort is stable: ties stay in first-seen order.
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  const seen = new Set();
  let description = '';
  for (const frame of keyframes) {
    const sentence = frame.description.trim();
    const key = sentence.toLowerCase();
    if (!sentence || seen.has(key)) continue;
    seen.add(key);
    const next = description ? `${description} ${sentence}` : sentence;
    if (description && next.length > MAX_DESCRIPTION) break;
    description = next.slice(0, MAX_DESCRIPTION);
  }
  return { tags: tags.slice(0, MAX_FILE_TAGS), description, keyframes };
}
