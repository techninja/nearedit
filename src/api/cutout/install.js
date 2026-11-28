/**
 * Installing the matting model: the ONNX file the built-in worker runs,
 * downloaded into the data folder — where `provider.js` looks for it —
 * checked for its size and, when the Python side is there, loaded once.
 * Nothing here runs unless a person runs `npm run install-cutout`.
 * @module api/cutout/install
 */

import { createWriteStream, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MODEL_FILE, MODELS_FOLDER } from './provider.js';

/** MODNet (Apache 2.0) as ONNX, from the Hugging Face hub. */
export const MODEL_URL = 'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx';
/** What that file weighs: anything else is not it. */
export const MODEL_BYTES = 25_888_640;

/**
 * @typedef {Object} ModelCheck - What loading a model file with the worker's Python gave
 * @property {string} reason - '' when it loaded and ran
 * @property {boolean} broken - The file is not a model that loads (as
 *   opposed to a Python that lacks something)
 */

/** @param {string} file @returns {number} Its size; -1 when it is not there */
function sizeOf(file) {
  try {
    return statSync(file).size;
  } catch {
    return -1; // not there yet
  }
}

/**
 * @param {string} url
 * @returns {Promise<Response>}
 * @throws {Error} When the server does not answer, or not with the file
 */
async function get(url) {
  // A minute to begin answering; the download itself may take as long as it takes.
  const waiting = new AbortController();
  const patience = setTimeout(() => waiting.abort(), 60_000);
  const answer = await fetch(url, { signal: waiting.signal })
    .catch((err) => {
      const cause = waiting.signal.aborted ? 'no answer' : err.cause?.code || err.cause?.message;
      throw new Error(`Cannot download the model (${url}): ${cause || err.message}`);
    })
    .finally(() => clearTimeout(patience));
  if (!answer.ok) throw new Error(`Cannot download the model (${url}): HTTP ${answer.status}`);
  return answer;
}

/**
 * Install the matting model.
 * @param {Object} options
 * @param {string} options.dataDir - `NEAREDIT_DATA_DIR`
 * @param {(line: string) => void} options.log
 * @param {(file: string) => Promise<ModelCheck>} options.check - Loads a model
 *   file with the Python the worker will run in
 * @param {string} [options.url] - Another address for the file (a mirror)
 * @param {number} [options.bytes] - The size it must have; 0 trusts what the
 *   server announces. Default: the known size for the known address
 * @param {boolean} [options.force] - Download again although the file is there
 * @returns {Promise<{ path: string, downloaded: boolean, ready: boolean, reason: string }>}
 *   `ready` is false, with the `reason`, when the file is in place but the
 *   Python side cannot run it yet
 * @throws {Error} Saying what failed; nothing is left half-written
 */
export async function installModel({ dataDir, log, check, url = MODEL_URL, bytes, force }) {
  const expected = bytes ?? (url === MODEL_URL ? MODEL_BYTES : 0);
  const path = join(dataDir, MODELS_FOLDER, MODEL_FILE);
  const has = sizeOf(path);
  const present = !force && (expected ? has === expected : has > 0);
  /** @type {ModelCheck|null} */
  let checked = null;
  if (present) log(`The model is already installed: ${path}`);
  else {
    if (has >= 0 && !force) log(`${path} is ${has} bytes, not ${expected}: downloading it again`);
    log(`Downloading the matting model (MODNet, Apache 2.0, ${Math.round(MODEL_BYTES / 1e6)} MB)`);
    log(`  from ${url}`);
    const partial = `${path}.${process.pid}.part`;
    mkdirSync(dirname(path), { recursive: true });
    try {
      const answer = await get(url);
      await pipeline(
        Readable.fromWeb(/** @type {any} */ (answer.body)),
        createWriteStream(partial),
      ).catch((err) => {
        throw new Error(`The download stopped (${url}): ${err.cause?.code || err.message}`);
      });
      const announced = Number(answer.headers.get('content-length')) || 0;
      const [got, want] = [sizeOf(partial), expected || announced];
      if (got <= 0 || (want && got !== want))
        throw new Error(
          `The download is ${got} bytes, not ${want}: it is not the model. Try again.`,
        );
      checked = await check(partial);
      if (checked.broken) throw new Error(`The downloaded file is not a model: ${checked.reason}`);
      renameSync(partial, path);
      log(`Saved ${got} bytes to ${path}`);
    } finally {
      rmSync(partial, { force: true });
    }
  }
  const { reason, broken } = checked || (await check(path));
  if (broken) throw new Error(reason);
  log(reason ? `Not ready yet: ${reason}` : `Ready: the model loads and runs.`);
  return { path, downloaded: !present, ready: !reason, reason };
}
