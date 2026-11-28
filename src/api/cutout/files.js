/**
 * Cutout files on disk: `<folder>/.nearedit/cutout/<key>.mp4` with its
 * description `<key>.json` beside it. A pair that exists is the cutout of
 * its key. Reading only — nothing here starts a process.
 * Contract: CUTOUT.md § The cutout file.
 * @module api/cutout/files
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { KEY_PATTERN, cutoutFps, cutoutSource, frameRange } from '#utils/cutout/index.js';
import { readJson } from '../lib/registry.js';

/** @typedef {import('#utils/cutout/types.js').CutoutMeta} CutoutMeta */
/** @typedef {import('#utils/cutout/types.js').CutoutSource} CutoutSource */

/**
 * @typedef {Object} Cutout - The result of a `cutout` job (CUTOUT.md § Server)
 * @property {string} file - The MP4: picture left, matte right
 * @property {string} key
 * @property {number} start - Seconds into the source of its first frame
 * @property {number} end
 * @property {number} fps
 * @property {number} width - Of the picture: the video is twice as wide
 * @property {number} height
 * @property {number} frames
 * @property {boolean} cached - True when nothing had to be made
 */

/** Version of the description this code writes and reads. */
export const META_VERSION = 1;

/**
 * @param {string} folder - A project folder, or the folder of a document
 * @returns {string} Where its cutouts live
 */
export const cutoutDir = (folder) => join(folder, '.nearedit', 'cutout');

/**
 * @param {string} folder
 * @param {string} key
 * @returns {{ file: string, metaPath: string }}
 * @throws {Error} For something that is not a key (it would be a path)
 */
export function cutoutPaths(folder, key) {
  if (!KEY_PATTERN.test(key)) throw new Error(`Not a cutout key: ${key}`);
  return {
    file: join(cutoutDir(folder), `${key}.mp4`),
    metaPath: join(cutoutDir(folder), `${key}.json`),
  };
}

/**
 * A media file as a cutout's key sees it.
 * @param {string} path
 * @returns {CutoutSource|null} null when it is not a file that can be read
 */
export function sourceOf(path) {
  try {
    const stat = statSync(path);
    return stat.isFile() ? cutoutSource({ path, size: stat.size, mtime: stat.mtimeMs }) : null;
  } catch {
    return null; // not there (or not ours to see): nothing to cut out
  }
}

/**
 * The description of a key's cutout, when the pair is complete.
 * @param {string} folder
 * @param {string} key
 * @returns {CutoutMeta|null}
 */
export function readMeta(folder, key) {
  const { file, metaPath } = cutoutPaths(folder, key);
  if (!existsSync(file) || !existsSync(metaPath)) return null;
  /** @type {any} */
  const meta = readJson(metaPath, null);
  const whole = meta?.key === key && meta.version === META_VERSION && meta.frames > 0;
  return whole && typeof meta.source?.path === 'string' ? meta : null;
}

/**
 * @param {string} folder
 * @param {CutoutMeta} meta
 * @returns {Cutout}
 */
const asCutout = (folder, { key, start, end, fps, width, height, frames }) => {
  const { file } = cutoutPaths(folder, key);
  return { file, key, start, end, fps, width, height, frames, cached: true };
};

/**
 * The cutout of a key, when it is complete.
 * @param {string} folder
 * @param {string} key
 * @returns {Cutout|null}
 */
export function readCutout(folder, key) {
  const meta = readMeta(folder, key);
  return meta && asCutout(folder, meta);
}

/**
 * A cutout that is already there and holds what is asked for: of the same
 * file as it is now, at the same frame rate, made by the same model, and
 * covering the range — a longer one made earlier serves a shorter request.
 * @param {string} folder
 * @param {CutoutSource} source
 * @param {{ start: number, end: number, fps: number, model: string }} range
 * @returns {Cutout|null} The shortest such cutout
 */
export function findCutout(folder, source, range) {
  const want = frameRange(range.start, range.end, range.fps);
  let names;
  try {
    names = readdirSync(cutoutDir(folder));
  } catch {
    return null; // no folder yet: nothing was ever cut out here
  }
  /** @type {CutoutMeta[]} */
  const covering = [];
  for (const name of names) {
    const key = name.endsWith('.json') ? name.slice(0, -5) : '';
    const meta = KEY_PATTERN.test(key) ? readMeta(folder, key) : null;
    if (!meta || meta.model !== range.model || cutoutFps(meta.fps) !== want.fps) continue;
    const { path, size, mtime } = cutoutSource(meta.source);
    if (path !== source.path || size !== source.size || mtime !== source.mtime) continue;
    const has = frameRange(meta.start, meta.end, meta.fps);
    const ends = has.startFrame + has.frames >= want.startFrame + want.frames;
    if (has.startFrame <= want.startFrame && ends) covering.push(meta);
  }
  covering.sort((a, b) => a.frames - b.frames || a.key.localeCompare(b.key));
  return covering.length ? asCutout(folder, covering[0]) : null;
}
