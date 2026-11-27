/**
 * Requirements — the stills and fonts a document needs before every frame
 * of it can be drawn completely. The server loads all of them first; the
 * browser warms them up and draws what is ready in the meantime.
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § The host environment.
 * @module utils/compose/requirements
 */

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
 * List what a document needs.
 * @param {{ tracks?: any[] }} edl
 * @returns {Requirements}
 */
export function requirements(edl) {
  const images = new Set();
  /** @type {Map<string, { font: string, text: string }>} */
  const fonts = new Map();
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
      if (kind === 'title') {
        const style = textStyle(clip.text);
        const font = fontString(style, 1);
        fonts.set(`${font}\n${style.content}`, { font, text: style.content });
      }
    }
  }
  return { images: [...images], fonts: [...fonts.values()] };
}
