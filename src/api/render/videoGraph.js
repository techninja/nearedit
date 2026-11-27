/**
 * Video graph: a black base of the output size, then every visible clip
 * overlaid back to front (last video track first; clips in start order).
 * It draws footage and stills only — everything else belongs to the canvas
 * path, and is refused here rather than drawn wrong. Pure.
 * @module api/render/videoGraph
 */

import { activeTracks } from '#utils/edl/query.js';
import { RenderError } from './errors.js';
import { filter } from './expr.js';
import { buildLayer } from './layer.js';
import { mediaLayer } from './mediaLayer.js';
import { REASONS, clipNeeds, trackNeeds } from './route.js';
import { clipWindow } from './timing.js';

/**
 * @typedef {Object} GraphContext
 * @property {import('./timing.js').Timing} timing
 * @property {{ width: number, height: number }} frame - EDL resolution
 * @property {{ width: number, height: number }} out - Rendered frame size
 * @property {import('./presets.js').RenderPreset} preset
 * @property {boolean} limiterLatency - alimiter supports delay compensation
 * @property {string} workDir - Where the graph script will be written
 * @property {string[]} needs - Why the whole document needs the compositor
 * @property {(file: string) => import('./sources.js').SourceInfo} source
 * @property {object[]} inputs - FFmpeg inputs, appended to as clips are added
 * @property {{ path: string, content: string|Buffer }[]} files - Files the graph needs on disk
 * @property {string[]} warnings
 */

/**
 * Refuse what only the compositor can draw.
 * @param {string[]} needs - Reason codes (`route.js`)
 * @param {string} what - What has them, for the message
 * @throws {RenderError} 422
 */
function refuse(needs, what) {
  if (!needs.length) return;
  const why = needs.map((code) => REASONS[code] || code).join(', ');
  throw new RenderError(422, `The filter graph cannot draw ${what}: it has ${why}`);
}

/**
 * @param {any[]} tracks - Snapped tracks of the document, in display order
 * @param {GraphContext} ctx
 * @returns {{ chains: string[], layers: number }} Chains ending in `[vout]`
 * @throws {RenderError} 422 when the rendered range holds anything that
 *   needs the compositor
 */
export function buildVideoGraph(tracks, ctx) {
  const { timing, out, preset } = ctx;
  refuse(ctx.needs, 'this timeline');
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
      if (!clipWindow(clip, timing)) continue;
      refuse([...clipNeeds(clip, track), ...trackNeeds(track)], `clip "${clip.clipId}"`);
      const media = mediaLayer(clip, track, ctx.source(clip.sourceFile), ctx.inputs.length, ctx);
      const layer = media && buildLayer(media.spec, ctx);
      if (!layer) continue;
      ctx.inputs.push(media.input);
      ctx.warnings.push(...layer.warnings.map((w) => `clip "${clip.clipId}": ${w}`));
      chains.push(layer.chain);
      chains.push(`[v${layers}]${layer.pad}${layer.overlay}[v${layers + 1}]`);
      layers++;
    }
  }
  chains.push(`[v${layers}]format=yuv420p[vout]`);
  return { chains, layers };
}
