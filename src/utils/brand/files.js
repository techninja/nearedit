/**
 * Every place a kit names a file: its logos, its font files, a picture a
 * layer shows, a sprite or mask a generator layer reads. A kit on disk
 * names them relative to its own folder; whoever loads it walks it through
 * here to make each path absolute — and to check it — before the kit is
 * resolved, so a design made from it names files a compositor can read.
 * Isomorphic and pure.
 * @module utils/brand/files
 */

import { generatorModule } from '#utils/compose/catalog.js';
import { imageParams } from '#utils/compose/params.js';
import { holdsReference } from './element/fields.js';

/**
 * @callback MapFile
 * @param {string} path - As the kit has it
 * @param {string} where - Where in the kit, e.g. `tokens.logo.main`, `fonts[0].file`
 * @returns {string} The path to use
 */

/**
 * @param {Record<string, any>} layer
 * @param {MapFile} map
 * @param {string} where
 * @returns {Record<string, any>} The layer with its file paths replaced
 */
function mapLayer(layer, map, where) {
  let out = layer;
  if (typeof layer.src === 'string' && layer.src && !holdsReference(layer.src)) {
    out = { ...out, src: map(layer.src, `${where}.src`) };
  }
  const schema = layer.type === 'generator' ? generatorModule(layer.generator)?.params : undefined;
  const named = Object.keys(schema || {}).filter((name) => schema[name].type === 'image');
  if (!imageParams(schema, layer.params).length) return out;
  const params = { ...layer.params };
  for (const name of named.filter((key) => typeof params[key] === 'string' && params[key])) {
    params[name] = map(params[name], `${where}.params.${name}`);
  }
  return { ...out, params };
}

/**
 * Copy a kit — or a design — with every file path passed through `map`.
 * @template {{ tokens?: any, fonts?: any[], elements?: Record<string, any>, layers?: any[] }} T
 * @param {T} kit - A normalised kit, an effective kit, or a design
 * @param {MapFile} map
 * @returns {T}
 */
export function mapKitFiles(kit, map) {
  /** @type {any} */
  const out = { ...kit };
  if (kit.tokens?.logo) {
    const logo = { ...kit.tokens.logo };
    for (const name of ['main', 'mark'].filter(
      (key) => typeof logo[key] === 'string' && logo[key],
    )) {
      logo[name] = map(logo[name], `tokens.logo.${name}`);
    }
    out.tokens = { ...kit.tokens, logo };
  }
  if (Array.isArray(kit.fonts)) {
    out.fonts = kit.fonts.map((face, i) => ({ ...face, file: map(face.file, `fonts[${i}].file`) }));
  }
  if (Array.isArray(kit.layers)) {
    out.layers = kit.layers.map((layer, i) => mapLayer(layer, map, `layers[${i}]`));
  }
  if (kit.elements) {
    out.elements = {};
    for (const [id, element] of Object.entries(kit.elements)) {
      const layers = (element.layers || []).map(
        (/** @type {any} */ layer, /** @type {number} */ i) =>
          mapLayer(layer, map, `elements.${id}.layers[${i}]`),
      );
      out.elements[id] = { ...element, layers };
    }
  }
  return out;
}

/**
 * The files a kit or a design names.
 * @param {Parameters<typeof mapKitFiles>[0]} kit
 * @returns {string[]} Each once
 */
export function kitFiles(kit) {
  /** @type {Set<string>} */
  const files = new Set();
  mapKitFiles(kit, (path) => (files.add(path), path));
  return [...files];
}
