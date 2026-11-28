/**
 * What drawing an element needs from outside: the pictures its image
 * layers show, the generators it runs (a host looks their image parameters
 * up in its catalog), and the fonts and words of its text — known without
 * laying anything out, so a host can load them first.
 * Isomorphic and pure.
 * @module utils/brand/element/needs
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { textContent, textFont } from './textFit.js';
import { viewOf } from './view.js';

/**
 * @typedef {Object} Needs
 * @property {string[]} images - Paths of image layers, each once
 * @property {{ type: string, params: Record<string, any> }[]} generators - Generator layers
 * @property {{ fontFamily: string, weight: number, italic: boolean, text: string }[]} texts -
 *   One entry per text layer that has words
 */

/** @type {WeakMap<object, Map<string, Needs>>} */
const known = new WeakMap();

/**
 * @param {import('#utils/brand/types.js').Design} design
 * @param {Record<string, any>|undefined} slots
 * @param {string} format
 * @returns {Needs}
 */
function needsOf(design, slots, format) {
  /** @type {Needs} */
  const needs = { images: [], generators: [], texts: [] };
  if (!isPlainObject(design) || !Array.isArray(design.layers)) return needs;
  for (const layer of viewOf(design, slots, format).layers) {
    if (layer.type === 'image' && typeof layer.src === 'string' && layer.src) {
      if (!needs.images.includes(layer.src)) needs.images.push(layer.src);
    } else if (layer.type === 'generator' && typeof layer.generator === 'string') {
      needs.generators.push({ type: layer.generator, params: layer.params || {} });
    } else if (layer.type === 'text') {
      const text = textContent(layer);
      const { family, weight, italic } = textFont(layer);
      if (text) needs.texts.push({ fontFamily: family, weight, italic, text });
    }
  }
  return needs;
}

/**
 * What an element block needs in a frame of one format.
 * @param {{ design?: any, slots?: any } | null | undefined} element - A clip's `element`
 * @param {string} format - `wide`, `tall` or `square`
 * @returns {Needs} The same object for the same block and format
 */
export function elementNeeds(element, format) {
  if (!element || typeof element !== 'object') return { images: [], generators: [], texts: [] };
  let byFormat = known.get(element);
  if (!byFormat) known.set(element, (byFormat = new Map()));
  if (!byFormat.has(format)) byFormat.set(format, needsOf(element.design, element.slots, format));
  return byFormat.get(format);
}
