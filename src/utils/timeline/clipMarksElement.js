/**
 * What the timeline shows on an element clip (a brand element,
 * docs/app-spec/BRAND.md): the name it goes by — what is filled into its
 * main slot — the element it is an instance of, the colours of its design
 * as a few chips, and whether it is out of date with the project's kit.
 * Pure and isomorphic; results are remembered per (immutable) design.
 * @module utils/timeline/clipMarksElement
 */

import { isElementClip } from '#utils/brand/clip.js';
import { isHex, parseColor } from '#utils/compose/color.js';

/** Colours shown in an element's chips at most. */
const MAX_COLORS = 4;
/** A colour fainter than this is a tint, not one of the brand's colours. */
const MIN_ALPHA = 0.5;

/** @type {WeakMap<object, string[]>} */
const chips = new WeakMap();

/**
 * An element's id as words: `lower-third` → `Lower third`.
 * @param {string} id
 * @returns {string}
 */
export function wordsOf(id) {
  const words = String(id || '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

/**
 * What an element clip is an instance of, in words: the label the kit
 * gives the element, else its id as words.
 * @param {any} clip - An element clip
 * @param {{ elements?: Record<string, { label?: string }> }|null} [kit] - The project's kit
 * @returns {string} e.g. `Lower third`
 */
export function elementName(clip, kit) {
  const { id } = clip.element;
  const known = kit?.elements && Object.hasOwn(kit.elements, id) ? kit.elements[id].label : '';
  return known || wordsOf(id) || 'Brand element';
}

/**
 * The text of an element clip's main slot: the first slot of its design
 * that is filled in.
 * @param {any} clip - An element clip
 * @returns {string} '' when none is filled (or the element has no slots)
 */
export function mainSlotText(clip) {
  const { slots = {}, design } = clip.element;
  const filled = (design.slots || []).map((name) => slots[name]).find((text) => text?.trim());
  return (filled || '').replace(/\s+/g, ' ').trim();
}

/**
 * The name shown on an element clip: a label somebody gave it, else its
 * main slot's text, else the element's name.
 * @param {any} clip - An element clip
 * @param {Parameters<typeof elementName>[1]} [kit]
 * @returns {string}
 */
export function elementClipLabel(clip, kit) {
  return clip.label || mainSlotText(clip) || elementName(clip, kit);
}

/**
 * The colours an element is drawn in: the fills, text colours and strokes
 * of its design's layers, back to front, each once, tints left out.
 * @param {{ layers?: any[] }} design - A clip's `element.design`
 * @returns {string[]} Up to four opaque hex colours (`#rrggbb`)
 */
export function elementColors(design) {
  if (!design || typeof design !== 'object') return [];
  if (chips.has(design)) return chips.get(design);
  /** @type {string[]} */
  const colors = [];
  for (const layer of Array.isArray(design.layers) ? design.layers : []) {
    for (const value of [layer?.fill, layer?.color, layer?.stroke, layer?.plate?.color]) {
      if (!isHex(value) || parseColor(value)[3] < MIN_ALPHA) continue;
      const [r, g, b] = parseColor(value);
      const solid = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      if (!colors.includes(solid)) colors.push(solid);
    }
  }
  const shown = colors.slice(0, MAX_COLORS);
  chips.set(design, shown);
  return shown;
}

/**
 * @param {any} clip
 * @param {Map<string, 'outdated'|'missing'>} stale - The document's stale
 *   element clips (`staleInfo().byClip`)
 * @returns {''|'outdated'|'missing'} What an element clip lacks of the
 *   project's kit. '' for a clip that is current, and for any other clip
 */
export function elementMark(clip, stale) {
  return isElementClip(clip) ? stale.get(clip.clipId) || '' : '';
}
