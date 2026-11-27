/**
 * Plan normalisation — forgives the harmless ways a language model strays
 * from the edit-plan schema (synonymous keys, numbers as text, a bare list)
 * before the plan is validated. Anything it cannot make sense of is left
 * for validation to report.
 * @module api/director/plan/normalize
 */

import { ROLES } from '#utils/director/planSchema.js';

const PICKS_KEYS = ['picks', 'segments', 'clips', 'sequence', 'timeline', 'shots', 'edits'];
const PART_KEYS = {
  file: ['file', 'source', 'media', 'handle', 'id', 'filename', 'sourceFile'],
  start: ['start', 'in', 'from', 'sourceIn', 'start_time', 'startTime'],
  end: ['end', 'out', 'to', 'sourceOut', 'end_time', 'endTime'],
  segments: ['segments', 'segment', 'lines'],
  scene: ['scene', 'shot'],
  duration: ['duration', 'length'],
};
const PICK_KEYS = {
  ...PART_KEYS,
  role: ['role', 'type', 'kind'],
  title: ['title', 'caption', 'text'],
  note: ['note', 'notes', 'reason', 'why', 'label', 'description'],
  visuals: ['visuals', 'broll', 'b_roll', 'b-roll', 'cutaways', 'overlays'],
};
const ROLE_WORDS = {
  'a-roll': 'primary',
  aroll: 'primary',
  main: 'primary',
  interview: 'primary',
  'b-roll': 'broll',
  b_roll: 'broll',
  cutaway: 'broll',
  voiceover: 'narration',
  'voice-over': 'narration',
  vo: 'narration',
};

/**
 * Seconds from a number, "12.5", "12.5s" or "1:05".
 * @param {unknown} value
 * @returns {unknown} A number when understood, else the value untouched
 */
export function toSeconds(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (/^\d+(\.\d+)?\s*s?$/i.test(text)) return parseFloat(text);
  const clock = text.match(/^(?:(\d+):)?(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (!clock) return value;
  return Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
}

/**
 * Segment numbers from 3, "s3", "3-6" or a list of those.
 * @param {unknown} value
 * @returns {unknown}
 */
function toSegments(value) {
  const items = Array.isArray(value) ? value : [value];
  const numbers = [];
  for (const item of items) {
    if (typeof item === 'number') numbers.push(item);
    else if (typeof item === 'string' && /^\s*s?\d+(\s*[-–]\s*s?\d+)?\s*$/i.test(item))
      numbers.push(...item.match(/\d+/g).map(Number));
    else return value;
  }
  return numbers;
}

/**
 * Copy the first present alias of each key; unknown keys are dropped.
 * @param {any} raw
 * @param {Record<string, string[]>} keys
 * @returns {Record<string, any>}
 */
function pickKeys(raw, keys) {
  const out = {};
  for (const [name, aliases] of Object.entries(keys)) {
    const alias = aliases.find((a) => raw[a] !== undefined && raw[a] !== null && raw[a] !== '');
    if (alias) out[name] = raw[alias];
  }
  return out;
}

/**
 * @param {any} raw - A pick, a visual, or just a file handle
 * @param {Record<string, string[]>} keys
 * @returns {any}
 */
function normalizePart(raw, keys) {
  if (typeof raw === 'string') return { file: raw.trim() };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const part = pickKeys(raw, keys);
  if (typeof part.file === 'number') part.file = String(part.file);
  if (typeof part.file === 'string') part.file = part.file.trim();
  for (const key of ['start', 'end', 'duration']) if (key in part) part[key] = toSeconds(part[key]);
  if ('segments' in part) part.segments = toSegments(part.segments);
  if (typeof part.scene === 'string' && /^\d+$/.test(part.scene.trim()))
    part.scene = Number(part.scene);
  return part;
}

/**
 * @param {any} raw
 * @returns {any}
 */
function normalizePick(raw) {
  const pick = normalizePart(raw, PICK_KEYS);
  if (!pick || typeof pick !== 'object' || Array.isArray(pick)) return pick;
  if (typeof pick.role === 'string') {
    const role = pick.role.trim().toLowerCase();
    pick.role = ROLES.includes(role) ? role : ROLE_WORDS[role];
  }
  if (pick.role === undefined) delete pick.role;
  for (const key of ['title', 'note']) {
    if (typeof pick[key] === 'string') pick[key] = pick[key].trim().slice(0, 300);
    if (!pick[key]) delete pick[key];
  }
  if ('visuals' in pick) {
    const list = Array.isArray(pick.visuals) ? pick.visuals : [pick.visuals];
    pick.visuals = list.map((v) => normalizePart(v, PART_KEYS));
  }
  return pick;
}

/**
 * Bring a parsed reply into edit-plan shape.
 * @param {any} parsed - JSON value from the model
 * @returns {any}
 */
export function normalizePlan(parsed) {
  let raw = Array.isArray(parsed) ? { picks: parsed } : parsed;
  if (!raw || typeof raw !== 'object') return raw;
  const hasPicks = (/** @type {any} */ o) => PICKS_KEYS.some((k) => Array.isArray(o?.[k]));
  if (!hasPicks(raw)) raw = Object.values(raw).find(hasPicks) || raw; // {"plan": {…}} wrappers
  const plan = {};
  const picksKey = PICKS_KEYS.find((k) => Array.isArray(raw[k]));
  if (picksKey) plan.picks = raw[picksKey].map(normalizePick);
  for (const key of ['rationale', 'title'])
    if (typeof raw[key] === 'string' && raw[key].trim()) plan[key] = raw[key].trim().slice(0, 600);
  if (raw.music) {
    const music = normalizePart(raw.music, { file: PART_KEYS.file, start: PART_KEYS.start });
    if (music && typeof music === 'object') {
      if (typeof raw.music.volume === 'number') music.volume = raw.music.volume;
      plan.music = music;
    }
  }
  return plan;
}
