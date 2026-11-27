/**
 * Request validation for the intelligence routes. Every file path is checked
 * against the allowed media roots, and every tuning value is forced to a
 * number in range before it can reach an FFmpeg filter string.
 * @module api/intelligence/requests
 */

import { statSync } from 'node:fs';
import { checkMediaPath } from '../lib/paths.js';
import { mediaType, scanProject } from '../lib/mediaScan.js';
import { getProjectDir } from '../lib/registry.js';
import { STEP_NAMES, orderSteps } from './steps/index.js';
import { isLanguage, languageCode } from './transcription/languages.js';

/**
 * @typedef {{ ok: false, status: number, error: string, detail?: string,
 *   fields?: Record<string, string> }} Rejection
 */

/**
 * @param {number} status
 * @param {string} error
 * @param {Partial<Rejection>} [extra]
 * @returns {Rejection}
 */
const reject = (status, error, extra = {}) => ({ ok: false, status, error, ...extra });

/**
 * Validate one media path from a request.
 * @param {unknown} filePath
 * @returns {{ ok: true, path: string, type: NonNullable<ReturnType<typeof mediaType>> } | Rejection}
 */
export function checkFile(filePath) {
  const checked = checkMediaPath(filePath);
  const detail = typeof filePath === 'string' ? filePath : undefined;
  if (checked.ok === false) return reject(checked.status, checked.error, { detail });
  const type = mediaType(checked.path);
  if (!type || !statSync(checked.path).isFile()) return reject(400, 'Not a media file', { detail });
  return { ok: true, path: checked.path, type };
}

/**
 * Per-step option rules: [name, test, message, convert].
 * @type {Record<string, [string, (v: any) => boolean, string, ((v: any) => any)?][]>}
 */
const OPTION_RULES = {
  transcribe: [['language', isLanguage, 'must be a language code such as "en"', languageCode]],
  tags: [['frames', (v) => Number.isInteger(v) && v >= 1 && v <= 12, 'must be an integer 1–12']],
  scenes: [['threshold', (v) => v > 0 && v < 1, 'must be a number between 0 and 1']],
  silence: [
    ['noiseDb', (v) => v >= -100 && v <= -1, 'must be a number of dB between -100 and -1'],
    ['minDuration', (v) => v >= 0.05 && v <= 60, 'must be between 0.05 and 60 seconds'],
  ],
};

/**
 * Validate the body of a single-step route.
 * @param {import('./steps/types.js').Step} step
 * @param {any} body
 * @returns {{ ok: true, filePath: string, type: import('./steps/types.js').MediaType,
 *   options: Record<string, any>, force: boolean, projectId: string } | Rejection}
 */
export function parseStepRequest(step, body = {}) {
  const file = checkFile(body?.filePath);
  if (file.ok === false) return file;
  /** @type {Record<string, any>} */
  const options = {};
  /** @type {Record<string, string>} */
  const fields = {};
  for (const [name, test, message, convert] of OPTION_RULES[step.name] || []) {
    const value = body[name];
    if (value === undefined || value === null || value === '') continue;
    // Tuning values must be real numbers; only `language` is text.
    const candidate = name === 'language' || typeof value === 'number' ? value : NaN;
    if (test(candidate)) options[name] = convert ? convert(candidate) : candidate;
    else fields[name] = `${name} ${message}`;
  }
  if (Object.keys(fields).length) return reject(400, 'Invalid options', { fields });
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  return {
    ok: true,
    filePath: file.path,
    type: file.type,
    options,
    force: body.force === true,
    projectId,
  };
}

/**
 * Validate the body of POST /intelligence/analyze (and POST /index).
 * @param {any} body
 * @returns {{ ok: true, projectId: string, files: string[], force: boolean,
 *   steps: import('./steps/types.js').Step[]|null } | Rejection}
 */
export function parseAnalyzeRequest(body = {}) {
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  if (projectId && !getProjectDir(projectId)) return reject(404, 'Project not found');

  let steps = null;
  if (body.steps !== undefined) {
    const valid = Array.isArray(body.steps) && body.steps.length > 0;
    if (!valid || body.steps.some((s) => !STEP_NAMES.includes(s))) {
      return reject(400, 'Invalid steps', { detail: `Use any of: ${STEP_NAMES.join(', ')}` });
    }
    steps = orderSteps(body.steps);
  }

  let files;
  if (body.paths !== undefined) {
    if (!Array.isArray(body.paths) || !body.paths.length) {
      return reject(400, 'paths must be a non-empty array of file paths');
    }
    files = [];
    for (const path of body.paths) {
      const file = checkFile(path);
      if (file.ok === false) return file;
      if (!files.includes(file.path)) files.push(file.path);
    }
  } else {
    files = scanProject(projectId).map((entry) => entry.filePath);
  }
  return { ok: true, projectId, files, steps, force: body.force === true };
}
