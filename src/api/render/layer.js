/**
 * One composited layer: the filter chain that turns a source (a file input
 * or a generated title card) into frames on the output timeline, and the
 * overlay that puts it onto the picture so far. Pure.
 * @module api/render/layer
 */

import { filter, num, progressExpr, quote } from './expr.js';
import { geometryFilters } from './layerFilters.js';

/**
 * @typedef {Object} LayerSpec
 * @property {string} id - Label of the layer's output pad
 * @property {string} [pad] - Input pad the chain reads, e.g. "[3:v:0]"
 * @property {string[]} [generate] - Source filters when there is no input pad
 * @property {boolean} still - One picture held for the whole layer (image, title)
 * @property {number} [lead] - Seconds the input starts before the layer's first frame
 * @property {import('./layerParts.js').LayerSource} source
 * @property {import('./placement.js').LayerGeometry} geometry
 * @property {{ count: number, offset: number, shift: number, length: number }} window
 * @property {number} fadeIn - Seconds from the clip's start
 * @property {{ start: number, duration: number } | null} fadeOut - Clip-local seconds
 * @typedef {Object} LayerContext
 * @property {import('./timing.js').Timing} timing
 * @property {{ width: number, height: number }} out
 * @property {import('./presets.js').RenderPreset} preset
 */

/**
 * Alpha fades on the layer's own clock. A range render that starts inside
 * a fade picks it up part-way, because the clock still counts from the
 * clip's start.
 * @param {LayerSpec} spec
 * @param {number} fps
 * @returns {string[]}
 */
function fadeFilters(spec, fps) {
  const from = spec.window.offset / fps;
  const to = (spec.window.offset + spec.window.count) / fps;
  const fades = [];
  if (spec.fadeIn > 0 && from < spec.fadeIn)
    fades.push(filter('fade', { t: 'in', st: 0, d: num(spec.fadeIn), alpha: 1 }));
  if (spec.fadeOut && spec.fadeOut.duration > 0 && to > spec.fadeOut.start) {
    const out = { t: 'out', st: num(spec.fadeOut.start), d: num(spec.fadeOut.duration), alpha: 1 };
    fades.push(filter('fade', out));
  }
  return fades;
}

/**
 * Bring a source to the output frame rate. Each output frame shows what a
 * player would show at that moment: the latest source frame that has
 * started, give or take a third of a frame so timestamps that are rounded
 * or jitter (variable-rate phone video) do not make frames repeat. The input
 * starts a little early (`lead`) so that frame is there for the first one.
 * @param {LayerSpec} spec
 * @param {import('./timing.js').Timing} timing
 * @returns {string[]}
 */
function conformFilters(spec, { fps, fpsText }) {
  if (spec.still) return [filter('fps', { fps: fpsText, start_time: 0 })];
  // 0.3 of a frame: 24, 25, 50 and 60 fps sources never land exactly on it.
  const tolerance = Math.min(0.3 / fps, 0.012);
  const shift = Math.round(((spec.lead || 0) + tolerance) * 1e6);
  // Microsecond time base, so the shift is exact whatever the container's.
  return [
    'settb=AVTB',
    `setpts=PTS-${shift}`,
    filter('fps', { fps: fpsText, round: 'up', start_time: 0 }),
  ];
}

/**
 * Build a layer.
 * @param {LayerSpec} spec
 * @param {LayerContext} ctx
 * @returns {{ chain: string, overlay: string, pad: string, warnings: string[] } | null}
 *   null when the layer cannot be seen. `chain` ends in `pad`; `overlay` is
 *   the filter that composites `pad` over the picture so far.
 */
export function buildLayer(spec, ctx) {
  const { fps } = ctx.timing;
  const { count, offset, shift, length } = spec.window;
  const seconds = length / fps;
  const geometry = geometryFilters(spec.geometry, spec.source, {
    out: ctx.out,
    preset: ctx.preset,
    progress: {
      local: progressExpr('t', 0, seconds),
      frame: progressExpr('on', 1 - offset, length),
      output: progressExpr('t', shift / fps, seconds),
    },
  });
  if (!geometry) return null;

  // Conform to the output frame rate; hold the last frame if the source runs short.
  const hold = [
    ...conformFilters(spec, ctx.timing),
    filter('tpad', { stop_mode: 'clone', stop_duration: num(count / fps + 1, 3) }),
    filter('trim', { end_frame: count }),
    ...(offset ? [`setpts=PTS+${offset}`] : []),
  ];
  // A still is cropped, scaled and rotated once, then repeated; only what
  // changes over time runs per frame. Video is conformed first, so frames
  // the output rate drops are never scaled.
  const { once, each } = geometry;
  const body = spec.still ? [...once, ...hold, ...each] : [...hold, ...once, ...each];
  const onTimeline = shift ? [`setpts=PTS${shift < 0 ? '-' : '+'}${Math.abs(shift)}`] : [];
  const filters = [...(spec.generate || []), ...body, ...fadeFilters(spec, fps), ...onTimeline];

  const first = shift + offset;
  const active = `between(t,${num((first - 0.5) / fps)},${num((first + count - 0.5) / fps)})`;
  const overlay = filter('overlay', {
    x: geometry.x,
    y: geometry.y,
    format: `yuv${ctx.preset.chroma}`,
    eof_action: 'pass',
    eval: geometry.animated ? 'frame' : 'init',
    enable: quote(active),
  });
  const pad = `[${spec.id}]`;
  return {
    chain: `${spec.pad || ''}${filters.join(',')}${pad}`,
    overlay,
    pad,
    warnings: geometry.warnings,
  };
}
