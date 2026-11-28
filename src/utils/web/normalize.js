/**
 * Recipe normalisation: turn whatever a document, a form or a language
 * model holds into a complete recipe — every default filled in, numbers
 * inside their ranges, strings bounded, unknown fields and unknown step
 * kinds gone. It reads only the fields it knows, from plain objects, so its
 * result is bounded JSON-safe data whatever went in. It never throws, never
 * changes its argument, and normalising twice changes nothing more.
 * Isomorphic and pure.
 * @module utils/web/normalize
 */

import { EASINGS } from '#utils/edl/easing.js';
import * as read from './coerce.js';
import {
  COLOR_SCHEMES,
  CURSOR_STYLES,
  DEFAULT_EASE,
  ON_MISSING,
  RECIPE_LIMITS as LIMITS,
  defaultRecipe,
} from './limits.js';
import { stepKind } from './stepKinds.js';
import { cleanTarget } from './target.js';

/** @typedef {import('./types.js').Recipe} Recipe */
/** @typedef {import('./types.js').Step} Step */
/** @typedef {import('./types.js').StepParam} StepParam */

/** Raw entries looked at before giving up on finding more usable ones. */
const SCAN = 10;

/**
 * @param {any} value
 * @param {number} limit - Entries of the result
 * @returns {any[]} The first entries of a list worth looking at
 */
function entries(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit * SCAN) : [];
}

/**
 * @param {any} value
 * @param {number} fallback
 * @param {ReadonlyArray<number>} range - `[min, max]`
 * @param {boolean} [integer]
 * @returns {number} A number inside the range
 */
function within(value, fallback, range, integer) {
  return read.numberIn(value, fallback, range[0], range[1], integer);
}

/**
 * One parameter of a step, as its description in the table wants it.
 * @param {StepParam} spec
 * @param {any} value
 * @returns {any}
 */
export function paramValue(spec, value) {
  if (spec.type === 'number') {
    return read.numberIn(value, spec.default, spec.min, spec.max, spec.integer);
  }
  if (spec.type === 'boolean') return read.boolOf(value, spec.default);
  if (spec.type === 'select') {
    if (spec.multiple) return read.someOf(value, spec.options);
    return read.oneOf(value, spec.options, spec.default);
  }
  if (spec.type === 'target') {
    // `scroll.to` also takes a position in pixels.
    const pixels = spec.number ? read.toNumber(value, NaN) : NaN;
    return Number.isNaN(pixels) ? cleanTarget(value) : Math.min(1e7, Math.max(0, pixels));
  }
  if (spec.type === 'key') {
    return typeof value === 'string' && value ? value.slice(0, LIMITS.key) : spec.default;
  }
  if (spec.type === 'code') return read.textOf(value, LIMITS.js);
  if (spec.format === 'color') return read.colorOf(value, spec.default);
  if (spec.format === 'url') return read.linkUrl(value, LIMITS.url);
  return read.textOf(value, LIMITS.text, spec.default);
}

/**
 * Normalise one step: the parameters of its kind with their defaults, its
 * `note` and `ease`, and — only when the step sets them — its own
 * `duration` and `hold`.
 * @param {any} raw
 * @returns {Step|null} null for anything that is not a step of a known kind
 */
export function normalizeStep(raw) {
  const from = read.record(raw);
  const kind = stepKind(read.own(from, 'do'));
  if (!kind) return null;
  /** @type {any} */
  const step = { do: kind.do };
  for (const [name, spec] of Object.entries(kind.params)) {
    step[name] = paramValue(spec, read.own(from, name));
  }
  for (const name of /** @type {('duration'|'hold')[]} */ (['duration', 'hold'])) {
    const seconds = read.toNumber(read.own(from, name), NaN);
    if (!Number.isNaN(seconds)) step[name] = Math.min(LIMITS.seconds, Math.max(0, seconds));
  }
  step.ease = read.oneOf(read.own(from, 'ease'), EASINGS, DEFAULT_EASE);
  step.note = read.textOf(read.own(from, 'note'), LIMITS.note);
  return step;
}

/**
 * Normalise a recipe.
 * @param {any} raw
 * @returns {Recipe} Always complete; `url` is '' when there is no usable
 *   `http(s)` address
 */
export function normalizeRecipe(raw) {
  const from = read.record(raw);
  const base = defaultRecipe();
  const viewport = read.record(read.own(from, 'viewport'));
  const cursor = read.record(read.own(from, 'cursor'));
  const seconds = (name) => read.numberIn(read.own(from, name), base[name], 0, LIMITS.seconds);
  /** @type {Step[]} */
  const steps = [];
  for (const entry of entries(read.own(from, 'steps'), LIMITS.steps)) {
    const step = steps.length < LIMITS.steps ? normalizeStep(entry) : null;
    if (step) steps.push(step);
  }
  return {
    url: read.pageUrl(read.own(from, 'url'), LIMITS.url),
    viewport: {
      width: within(read.own(viewport, 'width'), base.viewport.width, LIMITS.width, true),
      height: within(read.own(viewport, 'height'), base.viewport.height, LIMITS.height, true),
    },
    scale: within(read.own(from, 'scale'), base.scale, LIMITS.scale),
    colorScheme: read.oneOf(read.own(from, 'colorScheme'), COLOR_SCHEMES, base.colorScheme),
    lead: seconds('lead'),
    tail: seconds('tail'),
    cursor: {
      style: read.oneOf(read.own(cursor, 'style'), CURSOR_STYLES, base.cursor.style),
      size: within(read.own(cursor, 'size'), base.cursor.size, LIMITS.cursorSize),
      color: read.colorOf(read.own(cursor, 'color'), base.cursor.color),
      clicks: read.boolOf(read.own(cursor, 'clicks'), base.cursor.clicks),
    },
    hide: entries(read.own(from, 'hide'), LIMITS.hide)
      .map(cleanTarget)
      .filter((target) => target !== '')
      .slice(0, LIMITS.hide),
    storage: read.textOf(read.own(from, 'storage'), LIMITS.storage).trim(),
    onMissing: read.oneOf(read.own(from, 'onMissing'), ON_MISSING, base.onMissing),
    steps,
  };
}
