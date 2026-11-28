/**
 * Every place a document names a file: a clip's `sourceFile`, each `image`
 * parameter of a generator or an effect (a particle sprite, a mask), the
 * pictures and font files inside the design of an element clip, the cutout
 * file a clip remembers, and the font files of the document's own `fonts`
 * table. Whoever accepts a
 * document from outside — the render routes, the command line — walks it
 * through here to resolve and check each path before any of them is read.
 * Pure.
 * @module api/render/mediaPaths
 */

import { isElementClip } from '#utils/brand/clip.js';
import { mapKitFiles } from '#utils/brand/files.js';
import { effectModule, generatorModule } from '#utils/compose/catalog.js';
import { requirements } from '#utils/compose/requirements.js';
import { activeTracks } from '#utils/edl/query.js';

/**
 * @callback ResolvePath
 * @param {string} path - As the document has it
 * @param {string} where - Where in the document, e.g. `tracks[0].clips[2].sourceFile`
 * @returns {string} The path to use; throw to refuse it
 */

/**
 * @param {import('#utils/compose/params.js').ParamSchema|undefined} schema
 * @param {Record<string, any>|undefined} params
 * @param {ResolvePath} resolvePath
 * @param {string} where
 * @returns {Record<string, any>|undefined} The bag with its image paths replaced
 */
function mapParams(schema, params, resolvePath, where) {
  const names = Object.keys(schema || {}).filter(
    (name) => schema[name].type === 'image' && typeof params?.[name] === 'string' && params[name],
  );
  if (!names.length) return params;
  const out = { ...params };
  for (const name of names) out[name] = resolvePath(params[name], `${where}.${name}`);
  return out;
}

/**
 * @param {any[]|undefined} effects
 * @param {ResolvePath} resolvePath
 * @param {string} where
 * @returns {any[]|undefined}
 */
function mapEffects(effects, resolvePath, where) {
  if (!Array.isArray(effects)) return effects;
  return effects.map((fx, i) => {
    if (!fx) return fx;
    const schema = effectModule(fx.type)?.params;
    return { ...fx, params: mapParams(schema, fx.params, resolvePath, `${where}[${i}].params`) };
  });
}

/**
 * A clip's `cutout` block with the cutout file it remembers resolved. The
 * media file the cutout is of follows the clip's own path, so the two still
 * belong together; a cutout file the resolver gives no path for is left
 * out — the clip then renders its plain picture.
 * @param {any} clip
 * @param {string} sourceFile - The clip's resolved source
 * @param {ResolvePath} resolvePath
 * @param {string} at - Path of the clip
 * @returns {any}
 */
function mapCutout(clip, sourceFile, resolvePath, at) {
  const { made, ...settings } = clip.cutout;
  const file = typeof made.file === 'string' && resolvePath(made.file, `${at}.cutout.made.file`);
  if (!file) return settings;
  const source = made.source === clip.sourceFile ? sourceFile : made.source;
  return { ...settings, made: { ...made, file, source } };
}

/**
 * Copy a document with every file path passed through `resolvePath` — on
 * every track, also muted ones, so nothing in a document escapes the check.
 * @param {{ tracks: any[], fonts?: any[] }} edl - A normalised document
 * @param {ResolvePath} resolvePath
 * @returns {any}
 */
export function mapMediaPaths(edl, resolvePath) {
  const mapClip = (clip, at) => {
    const schema = generatorModule(clip.generator?.type)?.params;
    const params = mapParams(schema, clip.generator?.params, resolvePath, `${at}.generator.params`);
    // A design names its logo, its sprites and its font files like any other path.
    const inside = (path, where) => resolvePath(path, `${at}.element.design.${where}`);
    const element = isElementClip(clip)
      ? { ...clip.element, design: mapKitFiles(clip.element.design, inside) }
      : null;
    const sourceFile = clip.sourceFile ? resolvePath(clip.sourceFile, `${at}.sourceFile`) : '';
    return {
      ...clip,
      sourceFile,
      ...(clip.generator && { generator: { ...clip.generator, params } }),
      ...(element && { element }),
      ...(clip.cutout?.made && { cutout: mapCutout(clip, sourceFile, resolvePath, at) }),
      effects: mapEffects(clip.effects, resolvePath, `${at}.effects`),
    };
  };
  const fonts = Array.isArray(edl.fonts)
    ? edl.fonts.map((face, i) => ({ ...face, file: resolvePath(face.file, `fonts[${i}].file`) }))
    : null;
  const tracks = edl.tracks.map((track, t) => ({
    ...track,
    effects: mapEffects(track.effects, resolvePath, `tracks[${t}].effects`),
    clips: (track.clips || []).map((clip, c) => mapClip(clip, `tracks[${t}].clips[${c}]`)),
  }));
  return { ...edl, tracks, ...(fonts && { fonts }) };
}

/**
 * The stills and sprites the visible tracks of a document draw.
 * @param {{ tracks?: any[], fonts?: any[] }} edl
 * @returns {string[]} Unique paths
 */
export function renderImages(edl) {
  return requirements({ ...edl, tracks: activeTracks(edl.tracks || [], 'video') }).images;
}
