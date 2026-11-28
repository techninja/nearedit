/**
 * Recordings on disk: `<folder>/.nearedit/web/<key>.mp4` with the track
 * `<key>.json` beside it. A pair that exists is the recording of its
 * recipe. Reading only — nothing here starts a browser.
 * Contract: WEBCLIP.md § Recording.
 * @module api/web/recordings
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { KEY_PATTERN } from '#utils/web/index.js';
import { readJson } from '../lib/registry.js';

/**
 * @typedef {Object} Recording - The result of a `web` job (WEBCLIP.md § Server)
 * @property {string} file - The MP4
 * @property {string} key
 * @property {number} duration
 * @property {number} fps
 * @property {number} width
 * @property {number} height
 * @property {string} title
 * @property {import('#utils/web/types.js').Track} track
 * @property {boolean} cached - True when nothing had to be recorded
 */

/**
 * @param {string} folder - A project folder, or the folder of a document
 * @returns {string} Where its recordings live
 */
export const webDir = (folder) => join(folder, '.nearedit', 'web');

/**
 * @param {string} folder
 * @param {string} key
 * @returns {{ file: string, trackPath: string }}
 * @throws {Error} For something that is not a key (it would be a path)
 */
export function recordingPaths(folder, key) {
  if (!KEY_PATTERN.test(key)) throw new Error(`Not a recording key: ${key}`);
  return {
    file: join(webDir(folder), `${key}.mp4`),
    trackPath: join(webDir(folder), `${key}.json`),
  };
}

/**
 * The recording of a key, when it is complete.
 * @param {string} folder
 * @param {string} key
 * @returns {Recording|null}
 */
export function readRecording(folder, key) {
  const { file, trackPath } = recordingPaths(folder, key);
  if (!existsSync(file) || !existsSync(trackPath)) return null;
  /** @type {any} */
  const track = readJson(trackPath, null);
  if (!track || track.key !== key || !Array.isArray(track.steps)) return null;
  const { duration, fps, width, height, title } = track;
  return { file, key, duration, fps, width, height, title, track, cached: true };
}
