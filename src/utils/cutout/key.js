/**
 * The identity of a cutout file: a key made from everything that decides
 * what is in it — the media file as it is now, the stretch, the frame rate,
 * what makes the matte — and from nothing else. The same stretch of the
 * same file is never cut out twice; a changed file, another range or
 * another model has a new key. Isomorphic and pure.
 * Contract: docs/app-spec/CUTOUT.md § The cutout file, "Key".
 * @module utils/cutout/key
 */

import { KEY_LENGTH, canonicalJson } from '#utils/web/key.js';
import { sha256 } from '#utils/web/sha256.js';
import { frameRange } from './time.js';

export { KEY_LENGTH, KEY_PATTERN } from '#utils/web/key.js';

/** @typedef {import('./types.js').CutoutSource} CutoutSource */

/**
 * Version of the cutout file's making. Raise it when the same frames and the
 * same matte are packed differently (another layout, another frame rule):
 * every existing cutout then counts as out of date.
 */
export const CUTOUT_VERSION = 1;

/**
 * A media file as a key sees it.
 * @param {any} source - `{ path, size, mtime }`, as the media list gives them
 * @returns {CutoutSource} `mtime` in whole milliseconds
 */
export function cutoutSource(source) {
  return {
    path: String(source?.path ?? ''),
    size: Math.round(Number(source?.size) || 0),
    mtime: Math.round(Number(source?.mtime) || 0),
  };
}

/**
 * The key of the cutout of a stretch of a media file.
 * @param {Object} what
 * @param {any} what.source - `{ path, size, mtime }` of the media file
 * @param {number} what.start - Seconds; put on the frame grid here
 * @param {number} what.end - Seconds
 * @param {any} what.fps - Of the document the cutout is for
 * @param {string} what.model - What makes the matte, with its settings: the
 *   `model` of `GET /cutout/status`
 * @param {number|string} [version] - For tests
 * @returns {string} 20 lowercase hex digits: the start of the SHA-256 of
 *   `version \n canonical JSON` of the file, the frames, the rate and the model
 */
export function cutoutKey({ source, start, end, fps, model }, version = CUTOUT_VERSION) {
  const range = frameRange(start, end, fps);
  const what = {
    source: cutoutSource(source),
    fps: range.fps,
    first: range.startFrame,
    frames: range.frames,
    model: String(model ?? ''),
  };
  return sha256(`${version}\n${canonicalJson(what)}`).slice(0, KEY_LENGTH);
}
