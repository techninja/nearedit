/**
 * The person cutout, the pure half — everything about cutting a person out
 * of a clip that needs no model and no file: the `cutout` block of a clip,
 * the stretches of media a timeline needs cut out, the key of a cutout
 * file, and time inside one. Isomorphic: runs in the browser and in Node.
 * Contract: docs/app-spec/CUTOUT.md.
 *
 *   normalizeCutout(raw) → CutoutBlock          CUTOUT_FIELDS: the fields as data
 *   cutoutRanges(edl) → [{ path, start, end, fps, frames, clips }]
 *   cutoutKey({ source, start, end, fps, model }) → 20 hex digits
 *   coversClip(meta, clip) → boolean
 *   cutoutTime(meta, sourceTime) → { frame, time, inside }
 *
 * Shapes (`CutoutBlock`, `CutoutMeta`, `CutoutRange`, `CutoutSource`) are
 * the JSDoc types of `./types.js`.
 * @module utils/cutout
 */

/**
 * @typedef {import('./types.js').CutoutBlock} CutoutBlock
 * @typedef {import('./types.js').CutoutMeta} CutoutMeta
 * @typedef {import('./types.js').CutoutRange} CutoutRange
 * @typedef {import('./types.js').CutoutSource} CutoutSource
 */

export {
  CUTOUT_DEFAULTS,
  CUTOUT_FIELDS,
  CUTOUT_MODES,
  checkCutout,
  hasCutout,
  normalizeCutout,
} from './fields.js';
export { CUTOUT_MARGIN, CUTOUT_MAX_SECONDS, cutoutRanges, isCutoutClip } from './ranges.js';
export { CUTOUT_VERSION, KEY_LENGTH, KEY_PATTERN, cutoutKey, cutoutSource } from './key.js';
export { coversClip, cutoutFps, cutoutTime, frameRange, frameTolerance } from './time.js';
