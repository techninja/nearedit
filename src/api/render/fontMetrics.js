/**
 * Measuring fonts with FFmpeg itself. drawtext spaces lines by the font's
 * own line height, which varies a lot between fonts (1.1 to 1.4 × the
 * size); the preview uses a fixed 1.2. To make them agree the renderer
 * needs each font's line box and line pitch — read off a tiny test render,
 * so it is exactly what drawtext will do with whatever font fontconfig picks.
 * @module api/render/fontMetrics
 */

import { run } from '../lib/ffmpeg.js';
import { filter } from './expr.js';
import { renderableClips } from './scope.js';
import { fontOption } from './titleStyle.js';

const SIZE = 100;
const [WIDTH, HEIGHT] = [400, 700];
/** @type {Map<string, Promise<{ lineBox: number, pitch: number } | null>>} */
const cache = new Map();

/**
 * Measure one font: draw a one-line and a two-line white box side by side
 * and count their rows.
 * @param {string} fontfile - drawtext `fontfile` value, already escaped
 * @returns {Promise<{ lineBox: number, pitch: number } | null>} Multiples of
 *   the font size; null when the measurement fails
 */
async function measure(fontfile) {
  const draw = (text, x) => {
    const box = { box: 1, boxcolor: 'white', boxborderw: 0, y_align: 'font' };
    return filter('drawtext', { fontfile, text, fontsize: SIZE, x, y: 10, ...box });
  };
  const blank = filter('color', { c: 'black', s: `${WIDTH}x${HEIGHT}`, r: 1 });
  const chain = [blank, 'format=gray', 'trim=end_frame=1', draw('H', 0), draw("'H\nH'", WIDTH / 2)];
  const output = ['-map', '[v]', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'];
  const args = ['-hide_banner', '-loglevel', 'error', '-filter_complex', `${chain.join(',')}[v]`];
  try {
    const { stdout } = await run('ffmpeg', [...args, ...output], { binary: true, timeout: 20_000 });
    const rows = (from, to) => {
      let count = 0;
      for (let y = 0; y < HEIGHT; y++)
        if (stdout.subarray(y * WIDTH + from, y * WIDTH + to).some((v) => v > 128)) count++;
      return count;
    };
    const one = rows(0, WIDTH / 2);
    const two = rows(WIDTH / 2, WIDTH);
    if (!one || two <= one) return null;
    return { lineBox: one / SIZE, pitch: (two - one) / SIZE };
  } catch (err) {
    console.warn(`[render] cannot measure font ${fontfile}: ${err.message}`);
    return null;
  }
}

/**
 * Metrics of every font the titles of an EDL use (cached per process).
 * @param {{ tracks?: any[] }} edl
 * @param {import('./titleStyle.js').TextSupport} support
 * @returns {Promise<Record<string, { lineBox: number, pitch: number }>>} Keyed
 *   by drawtext font option; fonts that could not be measured are left out
 */
export async function measureTitleFonts(edl, support) {
  /** @type {Record<string, { lineBox: number, pitch: number }>} */
  const metrics = {};
  if (!support.drawtext || !support.textAlign) return metrics;
  const titles = renderableClips(edl).filter(({ kind }) => kind === 'title');
  const fonts = new Set(titles.map(({ clip }) => fontOption(clip.text || {}, support)?.fontfile));
  for (const fontfile of fonts) {
    if (!fontfile) continue;
    if (!cache.has(fontfile)) cache.set(fontfile, measure(fontfile));
    const measured = await cache.get(fontfile);
    if (measured) metrics[fontfile] = measured;
  }
  return metrics;
}
