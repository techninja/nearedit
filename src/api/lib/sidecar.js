/**
 * Sidecar metadata — `<media file>.nearedit.json` next to each source file.
 * Holds everything expensive to recompute (probe data, transcript, tags,
 * beats, scenes, silences). Invalidated when the source mtime changes.
 * Format reference: docs/app-spec/README.md § Sidecar Metadata.
 * @module api/lib/sidecar
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { writeJsonAtomic } from './registry.js';

export const SIDECAR_SUFFIX = '.nearedit.json';
export const INDEX_VERSION = 2;

/**
 * @typedef {Object} Sidecar
 * @property {number} [_sourceMtime]
 * @property {string} [_updatedAt]
 * @property {number} [_indexVersion]
 * @property {'video'|'audio'|'image'|'text'} [type]
 * @property {string} [filename]
 * @property {number|null} [duration]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number|null} [fps]
 * @property {boolean} [hasAudio]
 * @property {boolean} [hasVideo]
 * @property {{ word: string, start: number, end: number, probability?: number }[]|null} [transcript]
 * @property {{ id?: number, start: number, end: number, text: string }[]|null} [segments]
 * @property {string} [language]
 * @property {string[]} [tags]
 * @property {string} [description]
 * @property {{ time: number, tags: string[], description?: string }[]|null} [keyframes]
 * @property {number[]|null} [beats]
 * @property {number|null} [bpm]
 * @property {{ start: number, end: number }[]|null} [scenes]
 * @property {{ start: number, end: number }[]|null} [silences]
 */

/**
 * @param {string} mediaPath
 * @returns {string}
 */
export function sidecarPath(mediaPath) {
  return `${mediaPath}${SIDECAR_SUFFIX}`;
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function isSidecarFile(filePath) {
  return filePath.endsWith(SIDECAR_SUFFIX);
}

/**
 * Read a sidecar regardless of freshness.
 * @param {string} mediaPath
 * @returns {Sidecar|null}
 */
export function readSidecarRaw(mediaPath) {
  const path = sidecarPath(mediaPath);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * True when the sidecar is missing or older than its source file.
 * @param {string} mediaPath
 * @param {Sidecar|null} [sidecar]
 * @returns {boolean}
 */
export function isStale(mediaPath, sidecar = readSidecarRaw(mediaPath)) {
  if (!sidecar || !existsSync(mediaPath)) return true;
  return !sidecar._sourceMtime || sidecar._sourceMtime < statSync(mediaPath).mtimeMs;
}

/**
 * Read a sidecar; returns null when missing or stale.
 * @param {string} mediaPath
 * @returns {Sidecar|null}
 */
export function readSidecar(mediaPath) {
  const sidecar = readSidecarRaw(mediaPath);
  return isStale(mediaPath, sidecar) ? null : sidecar;
}

/**
 * Replace a sidecar, stamping freshness fields.
 * @param {string} mediaPath
 * @param {Sidecar} data
 * @returns {Sidecar}
 */
export function writeSidecar(mediaPath, data) {
  const stamped = {
    ...data,
    _sourceMtime: statSync(mediaPath).mtimeMs,
    _updatedAt: new Date().toISOString(),
    _indexVersion: INDEX_VERSION,
  };
  writeJsonAtomic(sidecarPath(mediaPath), stamped);
  return stamped;
}

/**
 * Merge a patch into a sidecar (creating it if needed). A stale sidecar is
 * discarded first so old analysis never survives a changed source file.
 * @param {string} mediaPath
 * @param {Partial<Sidecar>} patch
 * @returns {Sidecar}
 */
export function updateSidecar(mediaPath, patch) {
  const current = readSidecar(mediaPath) || {};
  return writeSidecar(mediaPath, { ...current, ...patch });
}
