/**
 * Waveform maths: turn the peaks the server computed for a source file
 * into one amplitude per screen column of a clip. A coarser copy of the
 * peaks keeps a zoomed-out hour of audio as cheap to draw as a few seconds.
 * Pure.
 * @module utils/timeline/peaks
 */

/** Fine peaks folded into one coarse peak. */
const BLOCK = 16;

/**
 * @typedef {Object} Wave
 * @property {Float32Array} fine - Loudest sample per window, 0..1
 * @property {Float32Array} coarse - Loudest of every BLOCK fine peaks
 * @property {number} rate - Fine peaks per second
 */

/**
 * Prepare peaks for drawing.
 * @param {ArrayLike<number>} peaks - 0..1, evenly spaced
 * @param {number} peaksPerSecond
 * @returns {Wave}
 */
export function buildWave(peaks, peaksPerSecond) {
  const fine = Float32Array.from(peaks);
  const coarse = new Float32Array(Math.ceil(fine.length / BLOCK));
  for (let i = 0; i < fine.length; i++) {
    const block = (i / BLOCK) | 0;
    if (fine[i] > coarse[block]) coarse[block] = fine[i];
  }
  return { fine, coarse, rate: peaksPerSecond > 0 ? peaksPerSecond : 1 };
}

/**
 * Amplitude of consecutive screen columns.
 * @param {Wave} wave
 * @param {number} fromTime - Source time at the left edge of the first column
 * @param {number} secondsPerColumn
 * @param {number} count - Number of columns
 * @returns {Float32Array} One value 0..1 per column; 0 beyond the source
 */
export function waveColumns(wave, fromTime, secondsPerColumn, count) {
  const out = new Float32Array(Math.max(0, count));
  const useCoarse = secondsPerColumn * wave.rate >= 2 * BLOCK;
  const data = useCoarse ? wave.coarse : wave.fine;
  const rate = useCoarse ? wave.rate / BLOCK : wave.rate;
  for (let column = 0; column < out.length; column++) {
    const start = Math.floor((fromTime + column * secondsPerColumn) * rate);
    const end = Math.max(start + 1, Math.ceil((fromTime + (column + 1) * secondsPerColumn) * rate));
    let max = 0;
    for (let i = Math.max(0, start); i < end && i < data.length; i++) {
      if (data[i] > max) max = data[i];
    }
    out[column] = max;
  }
  return out;
}

/**
 * How many frames a filmstrip of a source should hold: about one every two
 * seconds, within what the thumbnail route accepts.
 * @param {number} duration - Source duration in seconds; 0 when unknown
 * @param {boolean} [still] - An image: one frame is enough
 * @returns {number} 1..40
 */
export function stripColumns(duration, still = false) {
  if (still || !(duration > 0)) return 1;
  return Math.max(4, Math.min(40, Math.ceil(duration / 2)));
}

/**
 * Lay filmstrip tiles over the visible part of a picture clip. Tiles are
 * anchored to the source, not the clip, so trimming the start uncovers
 * frames instead of sliding them.
 * @param {Object} clip
 * @param {number} clip.x0 - Clip left edge, canvas pixels
 * @param {number} clip.x1 - Clip right edge
 * @param {number} clip.sourceIn - Seconds
 * @param {Object} strip
 * @param {number} strip.tileWidth - Pixels
 * @param {number} strip.pps - Pixels per second
 * @param {number} strip.duration - Source duration, seconds (0 = still)
 * @param {number} strip.cols - Frames in the strip
 * @param {number} viewWidth - Canvas width
 * @returns {{ x: number, cell: number }[]} Left edge and strip frame of each tile
 */
export function filmstripTiles(clip, strip, viewWidth) {
  const { tileWidth, pps, duration, cols } = strip;
  const still = !(duration > 0) || cols <= 1;
  const origin = still ? clip.x0 : clip.x0 - clip.sourceIn * pps;
  const from = Math.max(clip.x0, 0);
  const to = Math.min(clip.x1, viewWidth);
  const tiles = [];
  for (let i = Math.floor((from - origin) / tileWidth); origin + i * tileWidth < to; i++) {
    const middle = ((i + 0.5) * tileWidth) / pps;
    const cell = still ? 0 : Math.floor((middle / duration) * cols);
    tiles.push({ x: origin + i * tileWidth, cell: Math.max(0, Math.min(cols - 1, cell)) });
  }
  return tiles;
}
