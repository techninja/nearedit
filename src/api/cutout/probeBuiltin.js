/**
 * Asking the built-in matte worker whether it works: `person_matte.py
 * --check` starts the interpreter, imports onnxruntime and numpy, loads the
 * model and runs it once. What is missing is said for the person who can
 * fix it, with the command that does. Also the fingerprint of a model file,
 * which tells one model from another whatever the file is called.
 * @module api/cutout/probeBuiltin
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { run } from '../lib/ffmpeg.js';
import { WORKER_SCRIPT, WORKER_SETTINGS } from './provider.js';

const CHECK_TIMEOUT = 60_000;

/**
 * @param {string} file
 * @returns {Promise<string>} The first 12 hex digits of its SHA-256
 */
export async function fileDigest(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex').slice(0, 12);
}

/**
 * Why the built-in worker's check failed, for the person who can fix it.
 * @param {any} err - What `run` threw
 * @param {import('./provider.js').Provider} provider
 * @returns {string}
 */
function builtinReason(err, { python, modelFile, chosen }) {
  const said = String(err.stderr || err.message || '').trim();
  const last = said.split(/[\r\n]+/).pop() || '';
  const pip = `${python} -m pip install onnxruntime numpy`;
  if (err.code === 'ENOENT')
    return `No Python at "${python}": set CUTOUT_PYTHON to a Python 3 that has onnxruntime and numpy.`;
  if (err.killedBy === 'timed out')
    return `Python at ${python} did not answer within ${CHECK_TIMEOUT / 1000} s.`;
  if (err.code === 3) {
    const lacking = /missing module (\w+)/.exec(said)?.[1] || 'onnxruntime';
    return `Python at ${python} has no ${lacking}: ${pip}`;
  }
  const install = chosen
    ? 'put the model there, or unset CUTOUT_MODEL and run: npm run install-cutout'
    : 'npm run install-cutout';
  if (err.code === 4) return `No model at ${modelFile}: ${install}`;
  if (err.code === 5)
    return `${last.replace(/^person_matte: /, 'Python says: ')} — download it again: npm run install-cutout -- --force`;
  return `The matte worker does not start with ${python}: ${last}`;
}

/**
 * Start the built-in worker once, with its model.
 * @param {import('./provider.js').Provider} provider
 * @returns {Promise<{ model: string, reason: string, detail: string, broken: boolean }>}
 *   `model` names the model and the worker's settings — it goes into a
 *   cutout's key; `broken` says the model file is there and is not a model
 *   that loads (as opposed to a Python that lacks something)
 */
export async function probeBuiltin(provider) {
  const { python, modelFile } = provider;
  try {
    const args = [WORKER_SCRIPT, '--model', modelFile, '--check'];
    const { stdout } = await run(python, args, { timeout: CHECK_TIMEOUT });
    const facts = JSON.parse(stdout.trim().split('\n').pop() || '{}');
    const { size, steady, version } = WORKER_SETTINGS;
    const digest = await fileDigest(modelFile);
    return {
      model: `modnet-${digest}/size${size}/steady${steady}/v${version}`,
      reason: '',
      detail: `Python ${facts.python} at ${python}, onnxruntime ${facts.onnxruntime}, numpy ${facts.numpy}; model ${modelFile}`,
      broken: false,
    };
  } catch (err) {
    return { model: '', reason: builtinReason(err, provider), detail: '', broken: err.code === 5 };
  }
}
