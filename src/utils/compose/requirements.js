/**
 * Requirements — the stills and fonts a document needs before every frame
 * of it can be drawn completely. The server loads all of them first; the
 * browser warms them up and draws what is ready in the meantime.
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § The host environment.
 * @module utils/compose/requirements
 */

import { elementNeeds } from '#utils/brand/element/needs.js';
import { formatOf } from '#utils/brand/element/vocabulary.js';
import { parseResolution } from '#utils/edl/factory.js';
import { effectModule, generatorModule } from './catalog.js';
import { fontString } from './fonts.js';
import { layerKind } from './layers.js';
import { imageParams } from './params.js';
import { textStyle } from './text/style.js';

/**
 * @typedef {Object} Requirements
 * @property {string[]} images - Media paths, each once: stills used as clips
 *   and every `image` parameter of a generator or effect
 * @property {{ font: string, text: string }[]} fonts - A canvas `font` value
 *   and the text drawn with it, one entry per distinct pair
 */

/**
 * @param {any[]|undefined} effects
 * @returns {string[]} Image paths the effects of a stack refer to
 */
function effectImages(effects) {
  return (effects || []).flatMap((fx) => imageParams(effectModule(fx?.type)?.params, fx?.params));
}

/**
 * What an element clip needs in a frame of a format: the pictures of its
 * image layers, the image parameters of its generator layers, and a font
 * and its words for each text layer.
 * @param {any} clip - An element clip
 * @param {string} format - `wide`, `tall` or `square`
 * @param {any[]} [table] - The document's font table
 * @returns {Requirements}
 */
export function elementRequirements(clip, format, table) {
  const needs = elementNeeds(clip.element, format);
  const sprites = needs.generators.flatMap(({ type, params }) =>
    imageParams(generatorModule(type)?.params, params),
  );
  const fonts = needs.texts.map(({ text, ...face }) => ({
    font: fontString({ ...face, fontSize: 72, fonts: table }, 1),
    text,
  }));
  return { images: [...new Set([...needs.images, ...sprites])], fonts };
}

/**
 * List what a document needs.
 * @param {{ tracks?: any[], resolution?: string, fonts?: any[] }} edl
 * @returns {Requirements}
 */
export function requirements(edl) {
  const images = new Set();
  /** @type {Map<string, { font: string, text: string }>} */
  const fonts = new Map();
  const format = formatOf(parseResolution(edl.resolution));
  for (const track of edl.tracks || []) {
    if (track.type === 'audio') continue;
    for (const path of effectImages(track.effects)) images.add(path);
    for (const clip of track.clips || []) {
      const kind = layerKind(clip, track);
      if (!kind) continue;
      for (const path of effectImages(clip.effects)) images.add(path);
      if (kind === 'image') images.add(clip.sourceFile);
      if (kind === 'generator') {
        const schema = generatorModule(clip.generator.type)?.params;
        for (const path of imageParams(schema, clip.generator.params)) images.add(path);
      }
      if (kind === 'element') {
        const needs = elementRequirements(clip, format, edl.fonts);
        for (const path of needs.images) images.add(path);
        for (const entry of needs.fonts) fonts.set(`${entry.font}\n${entry.text}`, entry);
      }
      if (kind === 'title') {
        const style = textStyle(clip.text, edl.fonts);
        const font = fontString(style, 1);
        fonts.set(`${font}\n${style.content}`, { font, text: style.content });
      }
    }
  }
  return { images: [...images], fonts: [...fonts.values()] };
}
