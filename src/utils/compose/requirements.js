/**
 * Requirements — the stills, fonts and transcripts a document needs before
 * every frame of it can be drawn completely. The server loads all of them
 * first; the browser warms them up and draws what is ready in the meantime.
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § The host environment.
 * @module utils/compose/requirements
 */

import { elementNeeds } from '#utils/brand/element/needs.js';
import { FORMATS } from '#utils/brand/element/vocabulary.js';
import { captionRequirements } from './captionPass.js';
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
 * @property {string[]} words - The files whose transcripts the captions are
 *   made from, each once: what `env.words` will be asked for
 */

/**
 * @param {any[]|undefined} effects
 * @returns {string[]} Image paths the effects of a stack refer to
 */
function effectImages(effects) {
  return (effects || []).flatMap((fx) => imageParams(effectModule(fx?.type)?.params, fx?.params));
}

/**
 * What an element clip needs: the pictures of its image layers, the image
 * parameters of its generator layers, and a font and its words for each
 * text layer — in whichever format (wide, tall, square) it is drawn, so the
 * answer does not hang on the document's shape.
 * @param {any} clip - An element clip
 * @param {any[]} [table] - The document's font table
 * @returns {Pick<Requirements, 'images'|'fonts'>}
 */
export function elementRequirements(clip, table) {
  const images = new Set();
  /** @type {Map<string, { font: string, text: string }>} */
  const fonts = new Map();
  for (const format of FORMATS) {
    const needs = elementNeeds(clip.element, format);
    for (const path of needs.images) images.add(path);
    for (const { type, params } of needs.generators) {
      for (const path of imageParams(generatorModule(type)?.params, params)) images.add(path);
    }
    for (const { text, ...face } of needs.texts) {
      const font = fontString({ ...face, fontSize: 72, fonts: table }, 1);
      fonts.set(`${font}\n${text}`, { font, text });
    }
  }
  return { images: [...images], fonts: [...fonts.values()] };
}

/**
 * The pictures the element clips of a document show — their logos — so a
 * host can fetch them ahead of the frames that need them.
 * @param {{ tracks?: any[], fonts?: any[] }} edl
 * @returns {string[]} Media paths, each once
 */
export function elementImages(edl) {
  const images = new Set();
  for (const track of edl.tracks || []) {
    for (const clip of track.type === 'audio' ? [] : track.clips || []) {
      if (layerKind(clip, track) !== 'element') continue;
      for (const path of elementRequirements(clip, edl.fonts).images) images.add(path);
    }
  }
  return [...images];
}

/**
 * List what a document needs.
 * @param {{ tracks?: any[], fonts?: any[], captions?: { style?: unknown } }} edl
 * @param {(clip: any) => any} [wordsOf] - The transcript of a captioned
 *   clip's file, as `env.words` gives it, when the host has it already: the
 *   caption font is then listed with the characters it will draw
 * @returns {Requirements}
 */
export function requirements(edl, wordsOf) {
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
      if (kind === 'element') {
        const needs = elementRequirements(clip, edl.fonts);
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
  const captions = captionRequirements(edl, wordsOf);
  for (const entry of captions.fonts) fonts.set(`${entry.font}\n${entry.text}`, entry);
  return { images: [...images], fonts: [...fonts.values()], words: captions.words };
}
