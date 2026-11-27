/**
 * Video graph: a black base of the output size, then every visible clip
 * overlaid back to front (last video track first; clips in start order).
 * Pure.
 * @module api/render/videoGraph
 */

import { clipKind } from '#utils/edl/factory.js';
import { activeTracks } from '#utils/edl/query.js';
import { filter } from './expr.js';
import { buildLayer } from './layer.js';
import { mediaLayer } from './mediaLayer.js';
import { titleLayer } from './title.js';

/**
 * @typedef {Object} GraphContext
 * @property {import('./timing.js').Timing} timing
 * @property {{ width: number, height: number }} frame - EDL resolution
 * @property {{ width: number, height: number }} out - Rendered frame size
 * @property {import('./presets.js').RenderPreset} preset
 * @property {import('./titleStyle.js').TextSupport} text
 * @property {boolean} limiterLatency - alimiter supports delay compensation
 * @property {string} workDir - Where title text files will be written
 * @property {(file: string) => import('./sources.js').SourceInfo} source
 * @property {object[]} inputs - FFmpeg inputs, appended to as clips are added
 * @property {{ path: string, content: string }[]} files - Files the graph needs on disk
 * @property {string[]} warnings
 */

/**
 * Build the layer of one clip, registering its input or text file.
 * @param {any} clip
 * @param {any} track
 * @param {GraphContext} ctx
 * @returns {ReturnType<typeof buildLayer>}
 */
function clipLayer(clip, track, ctx) {
  if (clipKind(clip, track) === 'title') {
    const title = titleLayer(clip, track, `t${ctx.files.length}`, ctx);
    if (!title) return null;
    if ('warning' in title) {
      ctx.warnings.push(title.warning);
      return null;
    }
    const layer = buildLayer(title.spec, ctx);
    if (layer) ctx.files.push(title.file);
    return layer;
  }
  const media = mediaLayer(clip, track, ctx.source(clip.sourceFile), ctx.inputs.length, ctx);
  const layer = media && buildLayer(media.spec, ctx);
  if (layer) ctx.inputs.push(media.input);
  return layer;
}

/**
 * @param {any[]} tracks - Snapped tracks of the document, in display order
 * @param {GraphContext} ctx
 * @returns {{ chains: string[], layers: number }} Chains ending in `[vout]`
 */
export function buildVideoGraph(tracks, ctx) {
  const { timing, out, preset } = ctx;
  const size = `${out.width}x${out.height}`;
  const base = [
    filter('color', { c: 'black', s: size, r: timing.fpsText }),
    `format=yuv${preset.chroma}p`,
    filter('trim', { end_frame: timing.frames }),
  ];
  const chains = [`${base.join(',')}[v0]`];
  let layers = 0;
  // First video track is the front-most layer, so composite from the last one.
  for (const track of activeTracks(tracks, 'video').reverse()) {
    for (const clip of track.clips) {
      const layer = clipLayer(clip, track, ctx);
      if (!layer) continue;
      ctx.warnings.push(...layer.warnings.map((w) => `clip "${clip.clipId}": ${w}`));
      chains.push(layer.chain);
      chains.push(`[v${layers}]${layer.pad}${layer.overlay}[v${layers + 1}]`);
      layers++;
    }
  }
  chains.push(`[v${layers}]format=yuv420p[vout]`);
  return { chains, layers };
}
