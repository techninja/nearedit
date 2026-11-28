/**
 * Caption layout — everything `drawCaption` needs for one instant: where
 * each word is (that part never changes while a group is on screen), how
 * each looks right now, where the pill or underline is on its way from one
 * word to the next, the plate behind the group, and the caption's arrival.
 * Pure given `measure`.
 * Isomorphic. Contract: docs/app-spec/CAPTIONS.md § Drawing.
 * @module utils/captions/layout
 */

import { ease } from '#utils/edl/easing.js';
import { placeWords } from './geometry.js';
import { EM } from './metrics.js';
import { arrival, inkOn, markProgress, paintWords } from './paint.js';
import { resolveCaptionStyle } from './resolve.js';

/**
 * @typedef {import('./types.js').CaptionStyle} CaptionStyle
 * @typedef {import('./types.js').Rect} Rect
 */

/** A caption at rest with its first word marked: what a still preview shows. */
const AT_REST = { word: 0, age: Infinity, wordAge: Infinity, wordProgress: 1, lane: 0 };

/**
 * The pill or underline of one word.
 * @param {{ x: number, y: number, cy: number, width: number }} word
 * @param {string} mode - `box` or `underline`
 * @param {number} size - Font size, canvas pixels
 * @returns {Rect}
 */
function markOf(word, mode, size) {
  if (mode === 'underline') {
    const top = word.y + EM.underlineDrop * size;
    return { x: word.x, y: top, width: word.width, height: EM.underlineHeight * size };
  }
  const height = EM.pillHeight * size;
  const reach = EM.pillX * size;
  return { x: word.x - reach, y: word.cy - height / 2, width: word.width + reach * 2, height };
}

/**
 * Where the mark is at an instant: on the word being said, or on its way
 * there as the style's word motion has it.
 * @param {CaptionStyle} style
 * @param {ReturnType<typeof placeWords>} placed
 * @param {{ word: number, wordAge: number, wordProgress: number }} state
 * @returns {import('./types.js').LaidCaption['mark']}
 */
function markAt(style, placed, state) {
  const { mode } = style.highlight;
  if (mode !== 'box' && mode !== 'underline') return null;
  const word = placed.words[state.word];
  const { size } = placed;
  const { p, e } = markProgress(style, state);
  let rect = markOf(word, mode, size);
  const before = placed.words[state.word - 1];
  const how = style.motion.word;
  if (how === 'glide' && before?.line === word.line && e < 1) {
    const from = markOf(before, mode, size);
    rect.x = from.x + (rect.x - from.x) * e;
    rect.width = from.width + (rect.width - from.width) * e;
  } else if (how === 'fill' && state.wordProgress < 1) {
    // Grows from the word's leading edge, never thinner than it is tall.
    const least = mode === 'box' ? rect.height : 0;
    const width = Math.max(least, rect.width * state.wordProgress);
    rect = { ...rect, x: placed.rtl ? rect.x + rect.width - width : rect.x, width };
  } else if (how === 'pop' && p < 1) {
    const grown = 0.8 + 0.2 * ease('back-out', p);
    const width = rect.width * grown;
    const height = mode === 'box' ? rect.height * grown : rect.height;
    rect = {
      x: rect.x + (rect.width - width) / 2,
      y: rect.y + (rect.height - height) / 2,
      width,
      height,
    };
  }
  const radius = mode === 'box' ? EM.pillRadius * size : rect.height / 2;
  return { ...rect, radius: Math.min(radius, rect.width / 2, rect.height / 2), kind: mode };
}

/**
 * Lay a group out for an instant.
 * @param {import('./types.js').CaptionGroup} group - From `captionGroups`
 * @param {Partial<import('./types.js').CaptionState>|null|undefined} state -
 *   From `captionAt`; without one the caption is at rest on its first word
 * @param {unknown} style - A stored or resolved caption style
 * @param {import('./types.js').CaptionFrame} frame - The canvas being drawn
 * @param {(text: string) => number} measure - Width of a run of text set in
 *   `captionFont(style, frame)`, canvas pixels
 * @returns {import('./types.js').LaidCaption|null} null when there is nothing to draw
 */
export function layoutCaption(group, state, style, frame, measure) {
  if (!group?.words?.length || !(frame?.width > 0) || !(frame?.height > 0)) return null;
  const resolved = resolveCaptionStyle(style);
  const given = /** @type {any} */ (state !== null && typeof state === 'object' ? state : {});
  const at = { ...AT_REST };
  // Only numbers are taken from a state; an age may be endless, never negative.
  for (const key of /** @type {(keyof typeof AT_REST)[]} */ (Object.keys(AT_REST))) {
    if (typeof given[key] === 'number' && given[key] >= 0) at[key] = given[key];
  }
  at.word = Math.min(group.words.length - 1, Math.round(at.word));
  at.lane = Math.min(8, Math.round(at.lane));
  at.wordProgress = Math.min(1, at.wordProgress);
  const placed = placeWords(group, resolved, frame, measure, at.lane);
  const { size, box, room } = placed;
  const paints = paintWords(resolved, placed.words.length, at);
  const words = placed.words.map((word, i) => ({
    ...word,
    ...paints[i],
    dy: paints[i].dy * size,
  }));
  const { plate } = resolved;
  const moving = arrival(resolved, at.age);
  return {
    font: placed.font,
    size,
    unit: placed.unit,
    rtl: placed.rtl,
    words,
    box,
    plate: plate.on
      ? {
          x: box.x - room.x,
          y: box.y - room.top,
          width: box.width + room.x * 2,
          height: box.height + room.top + room.bottom,
        }
      : null,
    mark: markAt(resolved, placed, at),
    onMark: inkOn(resolved.highlight.color),
    motion: { ...moving, dy: moving.dy * size },
  };
}
