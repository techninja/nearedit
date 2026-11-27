/**
 * Adaptation settings — the allowed values, the resolution each aspect ratio
 * implies, and validation of the fields a client may set.
 * @module api/projects/adaptationFields
 */

import { assertValid } from '../lib/httpErrors.js';

/** Default output resolution per named aspect ratio. */
export const ASPECT_RESOLUTIONS = {
  '16:9': '1920x1080',
  '9:16': '1080x1920',
  '1:1': '1080x1080',
  '4:5': '1080x1350',
  '4:3': '1440x1080',
  '21:9': '2560x1080',
};
export const ASPECT_RATIOS = [...Object.keys(ASPECT_RESOLUTIONS), 'custom'];
export const ADAPTATION_STATUSES = ['draft', 'review', 'final', 'rendered'];
export const RESOLUTION_PATTERN = /^(\d{2,5})x(\d{2,5})$/;

const MAX_NAME = 200;
const MIN_SIDE = 16;
const MAX_SIDE = 8192;
/** How far a resolution may stray from its named ratio (2560x1080 is "21:9"). */
const RATIO_TOLERANCE = 0.05;

/**
 * @param {unknown} resolution
 * @returns {{ width: number, height: number }|null} null when not a usable "WxH"
 */
export function parseSize(resolution) {
  const match = typeof resolution === 'string' ? RESOLUTION_PATTERN.exec(resolution) : null;
  if (!match) return null;
  const [width, height] = [Number(match[1]), Number(match[2])];
  const ok = [width, height].every((side) => side >= MIN_SIDE && side <= MAX_SIDE);
  return ok ? { width, height } : null;
}

/**
 * @param {string} aspectRatio - e.g. "16:9"
 * @returns {number} width / height, or NaN for "custom"
 */
function ratioValue(aspectRatio) {
  const [w, h] = aspectRatio.split(':').map(Number);
  return w / h;
}

/**
 * Name the aspect ratio of a resolution.
 * @param {string} resolution - "WxH"
 * @returns {string} One of ASPECT_RATIOS ('custom' when nothing matches)
 */
export function aspectOf(resolution) {
  const size = parseSize(resolution);
  if (!size) return 'custom';
  const ratio = size.width / size.height;
  const named = Object.keys(ASPECT_RESOLUTIONS).find(
    (name) => Math.abs(ratio / ratioValue(name) - 1) <= RATIO_TOLERANCE,
  );
  return named || 'custom';
}

/**
 * Validate and clean the settable fields found in a request body. Only keys
 * that are present are checked and returned.
 * @param {any} body
 * @returns {{ name?: string, aspectRatio?: string, resolution?: string, fps?: number,
 *   status?: string }}
 * @throws {import('../lib/httpErrors.js').HttpError} 422 with per-field messages
 */
export function cleanAdaptationFields(body) {
  /** @type {Record<string, string>} */
  const fields = {};
  /** @type {ReturnType<typeof cleanAdaptationFields>} */
  const clean = {};
  const input = body && typeof body === 'object' ? body : {};

  if (input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) fields.name = 'name is required';
    else if (name.length > MAX_NAME) fields.name = `Maximum ${MAX_NAME} characters`;
    else clean.name = name;
  }
  if (input.aspectRatio !== undefined) {
    if (ASPECT_RATIOS.includes(input.aspectRatio)) clean.aspectRatio = input.aspectRatio;
    else fields.aspectRatio = `Must be one of: ${ASPECT_RATIOS.join(', ')}`;
  }
  if (input.resolution !== undefined) {
    if (parseSize(input.resolution)) clean.resolution = input.resolution;
    else fields.resolution = `Must look like 1920x1080, each side ${MIN_SIDE}-${MAX_SIDE} pixels`;
  }
  if (input.fps !== undefined) {
    if (Number.isFinite(input.fps) && input.fps >= 1 && input.fps <= 240) clean.fps = input.fps;
    else fields.fps = 'Must be a number between 1 and 240';
  }
  if (input.status !== undefined) {
    if (ADAPTATION_STATUSES.includes(input.status)) clean.status = input.status;
    else fields.status = `Must be one of: ${ADAPTATION_STATUSES.join(', ')}`;
  }
  assertValid(fields);
  return clean;
}

/**
 * Settle the aspect ratio / resolution pair of an adaptation from what the
 * client sent and what it had before.
 * @param {{ aspectRatio?: string, resolution?: string }} wanted - Cleaned request fields
 * @param {{ aspectRatio?: string, resolution?: string }} [current] - Existing or inherited values
 * @returns {{ aspectRatio: string, resolution: string }}
 * @throws {import('../lib/httpErrors.js').HttpError} 422 when the pair is contradictory
 */
export function settleFrame(wanted, current = {}) {
  let aspectRatio = wanted.aspectRatio;
  let resolution = wanted.resolution;
  if (aspectRatio && !resolution) {
    // A named ratio implies its default size, unless the current size already fits it.
    const keeps = current.resolution && aspectOf(current.resolution) === aspectRatio;
    resolution = keeps ? current.resolution : ASPECT_RESOLUTIONS[aspectRatio];
    if (!resolution) resolution = current.resolution;
    if (!resolution)
      assertValid({ resolution: 'resolution is required for a custom aspect ratio' });
  } else if (resolution && !aspectRatio) {
    aspectRatio = aspectOf(resolution);
  } else if (!resolution && !aspectRatio) {
    aspectRatio = current.aspectRatio || '16:9';
    resolution = current.resolution || ASPECT_RESOLUTIONS[aspectRatio] || '1920x1080';
  } else if (aspectRatio !== 'custom' && aspectOf(resolution) !== aspectRatio) {
    assertValid({ resolution: `${resolution} is not a ${aspectRatio} frame` });
  }
  return { aspectRatio, resolution };
}
