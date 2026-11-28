/**
 * What was made for a clip's cutout. A clip with cutout on remembers the
 * cutout file that was made for it — `cutout.made` — the way a web clip
 * remembers its recording: where the file is, what stretch of which media
 * file it holds, at what rate and size. That is enough to find the file,
 * to pick the frame for a moment of the source and to say whether the
 * cutout still covers what the clip plays, without asking a server.
 * Isomorphic and pure. Contract: docs/app-spec/CUTOUT.md § In the document.
 * @module utils/cutout/made
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { KEY_PATTERN } from '#utils/web/key.js';
import { hasCutout } from './fields.js';
import { coversClip, cutoutFps, cutoutTime } from './time.js';

/** @typedef {import('./types.js').CutoutMade} CutoutMade */

/** The fields of `cutout.made`, in the order they are written. */
export const MADE_FIELDS = [
  ...['file', 'key', 'source', 'start', 'end'],
  ...['fps', 'width', 'height', 'frames'],
];
const MAX_PATH = 4096;
const MAX_SIDE = 8192;
/** A frame this much wider than the picture, or more, is the packed frame (√2). */
const PACKED = Math.SQRT2;
const NEAR = 1e-6;

/** @type {(value: unknown) => string} A usable path or key, or '' */
const text = (value) =>
  typeof value === 'string' && value !== '' && value.length <= MAX_PATH ? value : '';
/** @type {(value: unknown, max: number) => number} A whole number from 1 to `max`, or 0 */
const whole = (value, max) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max ? value : 0;
/** @type {(value: unknown) => number} A finite number, or NaN */
const real = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : NaN);

/**
 * Read what was made: the result of a finished `cutout` job, the
 * description of a cutout file, or a stored `cutout.made`.
 * @param {any} raw - `{ file, key, source, start, end, fps, width, height,
 *   frames }`; `source` is the media file's path (or `{ path }`, as a
 *   description has it)
 * @returns {CutoutMade|null} null unless every field is usable; the stored
 *   object itself when it is already exactly that
 */
export function cleanMade(raw) {
  if (!isPlainObject(raw)) return null;
  const made = {
    file: text(raw.file),
    key: typeof raw.key === 'string' && KEY_PATTERN.test(raw.key) ? raw.key : '',
    source: text(isPlainObject(raw.source) ? raw.source.path : raw.source),
    start: real(raw.start),
    end: real(raw.end),
    fps: real(raw.fps),
    width: whole(raw.width, MAX_SIDE),
    height: whole(raw.height, MAX_SIDE),
    frames: whole(raw.frames, Number.MAX_SAFE_INTEGER),
  };
  const named = made.file && made.key && made.source;
  const timed = made.start >= 0 && made.end > made.start && made.fps >= 1 && made.fps <= 240;
  if (!named || !timed || !made.width || !made.height || !made.frames) return null;
  const same =
    Object.keys(raw).length === MADE_FIELDS.length &&
    MADE_FIELDS.every((name) => raw[name] === made[/** @type {keyof CutoutMade} */ (name)]);
  return same ? raw : made;
}

/**
 * The cutout a clip is drawn through: cutout on, and something made for
 * the file the clip plays now.
 * @param {any} clip
 * @returns {CutoutMade|null} null for a clip without cutout, one that has
 *   nothing made yet, and one whose cutout is of another file
 */
export function cutoutOf(clip) {
  if (!hasCutout(clip)) return null;
  const made = clip.cutout.made;
  return isPlainObject(made) && made.source === clip.sourceFile ? made : null;
}

/**
 * Where a clip's cutout stands.
 * @param {any} clip
 * @param {any} [fps] - The document's frame rate. With it, a cutout made at
 *   another rate is out of date
 * @returns {'off'|'missing'|'stale'|'ready'} `missing`: nothing made for
 *   this file yet — the plain picture shows. `stale`: something is made but
 *   it no longer covers what the clip plays (or was made at another rate) —
 *   the covered part still plays. `ready`: the clip is drawn through its matte
 */
export function cutoutState(clip, fps) {
  if (!hasCutout(clip)) return 'off';
  const made = cutoutOf(clip);
  if (!made) return 'missing';
  const rated = fps === undefined || cutoutFps(fps) === cutoutFps(made.fps);
  return rated && coversClip(made, clip) ? 'ready' : 'stale';
}

/**
 * The frame of its cutout file a clip shows at a moment of its source —
 * what a host plays instead of the clip's own file.
 * @param {any} clip
 * @param {number} sourceTime - Seconds into the clip's media file
 * @returns {{ made: CutoutMade, frame: number, time: number }|null} `frame`
 *   is the index in the cutout file and `time` the second it starts at
 *   there; null when the plain picture is to be shown: no cutout, or the
 *   moment lies outside the stretch that was made
 */
export function cutoutShown(clip, sourceTime) {
  const made = cutoutOf(clip);
  if (!made) return null;
  // As `coversClip`: a snapped clip may reach half a frame past either end.
  const slack = 0.5 / cutoutFps(made.fps) + NEAR;
  if (sourceTime < made.start - slack || sourceTime >= made.end + slack) return null;
  const { frame, time } = cutoutTime(made, sourceTime);
  return { made, frame, time };
}

/**
 * Whether a frame a host handed over is the packed frame of a cutout — the
 * picture on the left, its matte on the right — and not the plain picture:
 * it is twice as wide for its height as the picture is. A reduced copy
 * counts; so a host may hand over whichever it has.
 * @param {Pick<CutoutMade, 'width'|'height'>} made
 * @param {{ width: number, height: number }} size - Of the frame
 * @returns {boolean}
 */
export function isPacked(made, size) {
  if (!(size.width > 0 && size.height > 0 && made.width > 0 && made.height > 0)) return false;
  return size.width * made.height > PACKED * made.width * size.height;
}

/**
 * The size of the picture in a frame a host shows for a clip: the frame's
 * own — or, when the frame is the packed frame of the clip's cutout, its
 * left half. What the compositor places, and what a selection box goes round.
 * @param {any} clip
 * @param {{ width: number, height: number }} size - Of the frame its player holds
 * @returns {{ width: number, height: number }}
 */
export function shownSize(clip, size) {
  const made = cutoutOf(clip);
  if (!made || !isPacked(made, size)) return size;
  return { width: Math.floor(size.width / 2), height: size.height };
}
