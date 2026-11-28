/**
 * Is there a matte program the cutout job can use? Found by really asking:
 * the built-in worker is started with `--check` — the interpreter runs, the
 * imports work, the model file loads and answers — and a program of one's
 * own is sent two small frames. The answer is remembered until what it was
 * asked of changes. Contract: CUTOUT.md § The matte model, `GET /cutout/status`.
 * @module api/cutout/providerStatus
 */

import { statSync } from 'node:fs';
import { HttpError } from '../lib/httpErrors.js';
import { probeBuiltin } from './probeBuiltin.js';
import { probeCommand } from './probeCommand.js';
import { WORKER_SCRIPT, findProvider } from './provider.js';

/**
 * @typedef {Object} CutoutStatus
 * @property {boolean} available
 * @property {'builtin'|'command'} provider - The built-in worker, or `CUTOUT_COMMAND`
 * @property {string} model - What makes the matte, with its settings: goes
 *   into `cutoutKey`. '' when not available
 * @property {string} reason - Why not, and what to do; '' when available
 * @property {string} detail - What was found: versions, paths
 * @property {string} python - builtin: the interpreter
 * @property {string} file - builtin: the model file
 * @property {string} command - command: `CUTOUT_COMMAND`
 */

/** @type {Map<string, Promise<{ model: string, reason: string, detail: string }>>} */
const probes = new Map();

/**
 * @param {string} file
 * @returns {string} What changes when the file does; '' when it is not there
 */
function stamp(file) {
  try {
    const { size, mtimeMs } = statSync(file);
    return `${size}:${mtimeMs}`;
  } catch {
    return ''; // missing: the check itself says so
  }
}

/**
 * @param {{ fresh?: boolean }} [options] - `fresh`: ask again instead of using what is remembered
 * @returns {Promise<CutoutStatus>}
 */
export async function cutoutStatus({ fresh = false } = {}) {
  const provider = findProvider();
  const { kind, python, modelFile, command } = provider;
  const key =
    kind === 'command'
      ? `command|${command}`
      : `builtin|${python}|${modelFile}|${stamp(modelFile)}|${stamp(WORKER_SCRIPT)}`;
  if (fresh || !probes.has(key))
    probes.set(key, kind === 'command' ? probeCommand(provider) : probeBuiltin(provider));
  const found = await /** @type {Promise<any>} */ (probes.get(key));
  // A failure may be passing (a busy machine, a model being installed): the next question asks again.
  if (found.reason) probes.delete(key);
  return {
    ...{ available: !found.reason, provider: kind, model: found.model },
    ...{ reason: found.reason, detail: found.detail, python, file: modelFile, command },
  };
}

/**
 * The matte program to cut out with.
 * @returns {Promise<{ provider: import('./provider.js').Provider, model: string }>}
 * @throws {HttpError} 503 with the reason when there is none
 */
export async function requireProvider() {
  const status = await cutoutStatus();
  if (!status.available) throw new HttpError(503, status.reason);
  return { provider: findProvider(), model: status.model };
}
