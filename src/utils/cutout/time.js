/**
 * Time in a cutout file. A cutout is cut on the frame grid of the document
 * it was made for: frame `n` is the frame of the source the render shows at
 * `start + n / fps`. These functions say which frames a stretch of source
 * is, whether a cutout covers what a clip plays, and which of its frames
 * belongs to a moment of the source. Isomorphic and pure.
 * Contract: docs/app-spec/CUTOUT.md § The cutout file.
 * @module utils/cutout/time
 */

/** @typedef {import('./types.js').CutoutMeta} CutoutMeta */

const NTSC = [23.976, 29.97, 59.94, 119.88];
/** Rounding slack, in frames, when a time is compared with the frame grid. */
const NEAR = 1e-6;

/**
 * A frame rate as the renderer counts with it: 1 to 240, the broadcast
 * rates exact (`29.97` is 30000/1001), whole rates whole, anything else to
 * the thousandth. The same rule as the renderer's `fpsRational` — a test
 * holds the two together.
 * @param {any} fps
 * @returns {number} 30 for anything that is not a rate
 */
export function cutoutFps(fps) {
  const raw = Math.max(1, Math.min(240, Number(fps) || 30));
  const ntsc = NTSC.find((rate) => Math.abs(rate - raw) < 0.011);
  if (ntsc) return (Math.round(ntsc) * 1000) / 1001;
  if (Math.abs(raw - Math.round(raw)) < 1e-6) return Math.round(raw);
  return Math.round(raw * 1000) / 1000;
}

/**
 * How late a frame may start and still be the one shown, in frames: the
 * renderer shows the latest source frame that has started, give or take a
 * third of a frame (never more than 12 ms), so rounded timestamps do not
 * make it show the frame before. The renderer's own number (`conform.js`).
 * @param {number} fps
 * @returns {number}
 */
export function frameTolerance(fps) {
  return Math.min(0.3, 0.012 * fps);
}

/**
 * A stretch of source on the frame grid: it starts on the frame that is on
 * screen at `start`, ends where the frame on screen just before `end` ends,
 * and holds at least one frame.
 * @param {number} start - Seconds
 * @param {number} end - Seconds
 * @param {any} fps
 * @returns {{ start: number, end: number, fps: number, startFrame: number, frames: number }}
 */
export function frameRange(start, end, fps) {
  const rate = cutoutFps(fps);
  const startFrame = Math.max(0, Math.floor((Number(start) || 0) * rate + NEAR));
  const endFrame = Math.max(startFrame + 1, Math.ceil((Number(end) || 0) * rate - NEAR));
  const frames = endFrame - startFrame;
  return { start: startFrame / rate, end: endFrame / rate, fps: rate, startFrame, frames };
}

/**
 * Whether a cutout file holds everything a clip plays: it is of the clip's
 * file, and its range covers the clip's source window.
 * @param {{ source: string | { path: string }, start: number, end: number,
 *   fps: number }|null|undefined} meta - A description (`source.path`), or
 *   what a clip remembers of its cutout (`source` is the path)
 * @param {{ sourceFile?: string, sourceIn: number, sourceOut: number }} clip
 * @returns {boolean} False without a description
 */
export function coversClip(meta, clip) {
  const path = typeof meta?.source === 'string' ? meta.source : meta?.source?.path;
  if (!meta || !clip || !path || path !== clip.sourceFile) return false;
  // A render moves a clip's window with its snapped start: by half a frame at most.
  const slack = 0.5 / cutoutFps(meta.fps) + NEAR;
  return meta.start <= clip.sourceIn + slack && clip.sourceOut <= meta.end + slack;
}

/**
 * The frame of a cutout file that belongs to a moment of the source: the
 * latest one that has started, by the renderer's own rule.
 * @param {Pick<CutoutMeta, 'start'|'fps'|'frames'>} meta
 * @param {number} sourceTime - Seconds into the source file
 * @returns {{ frame: number, time: number, inside: boolean }} `frame` is the
 *   index in the file and `time` the second it starts at there — held at the
 *   first or the last frame for a moment the file does not cover, which
 *   `inside` then says
 */
export function cutoutTime(meta, sourceTime) {
  const fps = cutoutFps(meta.fps);
  const at = Math.floor((sourceTime - meta.start) * fps + frameTolerance(fps));
  const last = Math.max(0, Math.round(meta.frames) - 1);
  const frame = Math.max(0, Math.min(last, at));
  return { frame, time: frame / fps, inside: at === frame };
}
