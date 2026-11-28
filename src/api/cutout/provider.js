/**
 * Which program makes the mattes: `CUTOUT_COMMAND` when it is set — any
 * program that speaks the frame protocol — and otherwise the built-in
 * worker, `workers/person_matte.py`, run by `CUTOUT_PYTHON` on the model
 * `CUTOUT_MODEL`. Nothing is started here; whether it really works is
 * `providerStatus.js`. Contract: docs/app-spec/CUTOUT.md § The matte model.
 * @module api/cutout/provider
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../lib/config.js';

/**
 * @typedef {Object} Provider
 * @property {'builtin'|'command'} kind
 * @property {string[]} words - The program and its fixed arguments; the frame
 *   size and rate are added for each run (`matteCommand`)
 * @property {string} python - builtin: the interpreter; '' otherwise
 * @property {string} modelFile - builtin: the ONNX model; '' otherwise
 * @property {string} command - command: `CUTOUT_COMMAND` as it was set; '' otherwise
 * @property {boolean} chosen - builtin: the model's place was set with `CUTOUT_MODEL`
 */

export const WORKER_SCRIPT = fileURLToPath(
  new URL('../../../workers/person_matte.py', import.meta.url),
);
/** Where `npm run install-cutout` puts the model inside the data folder. */
export const MODELS_FOLDER = 'models';
export const MODEL_FILE = 'modnet.onnx';
const OWN_DATA = fileURLToPath(new URL('../../../data', import.meta.url));

/**
 * How the built-in worker is run. They decide what the matte looks like, so
 * they are part of a cutout's key: change one and every cutout is out of date.
 */
export const WORKER_SETTINGS = Object.freeze({ size: 512, steady: 0.6, version: 1 });

/**
 * Split a command line into words, without a shell: blanks separate, single
 * and double quotes keep blanks, a backslash keeps the next character.
 * Inside single quotes nothing is special — a Windows path may be written
 * `'C:\tools\matte.exe'`.
 * @param {string} text
 * @returns {string[]}
 */
export function splitCommand(text) {
  const words = [];
  let word = null;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = '';
      else if (char === '\\' && quote === '"' && i + 1 < text.length) word += text[++i];
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      word ??= '';
    } else if (/\s/.test(char)) {
      if (word !== null) words.push(word);
      word = null;
    } else {
      word = (word ?? '') + (char === '\\' && i + 1 < text.length ? text[++i] : char);
    }
  }
  if (word !== null) words.push(word);
  return words;
}

/**
 * The model file the built-in worker reads: `CUTOUT_MODEL` when set — only
 * that one, also when it is missing: the person chose it — otherwise the
 * one in the data folder, then the one in NearEdit's own data folder (the
 * command line runs from anywhere).
 * @param {{ model: string }} cutout - The `cutout` settings
 * @param {string} dataDir
 * @returns {{ file: string, chosen: boolean }}
 */
export function modelPath(cutout, dataDir) {
  if (cutout.model.trim()) return { file: resolve(cutout.model.trim()), chosen: true };
  const places = [dataDir, OWN_DATA].map((dir) => join(dir, MODELS_FOLDER, MODEL_FILE));
  return { file: places.find((file) => existsSync(file)) || places[0], chosen: false };
}

/**
 * @returns {Provider} The built-in worker as the settings have it — whether
 *   or not `CUTOUT_COMMAND` takes its place
 */
export function builtinProvider() {
  const { cutout, dataDir } = getConfig();
  const { file, chosen } = modelPath(cutout, dataDir);
  const { size, steady } = WORKER_SETTINGS;
  const fixed = ['--model', file, '--size', String(size), '--steady', String(steady)];
  return {
    kind: 'builtin',
    words: [cutout.python, WORKER_SCRIPT, ...fixed],
    ...{ python: cutout.python, modelFile: file, command: '', chosen },
  };
}

/**
 * @returns {Provider} The matte program the settings ask for
 */
export function findProvider() {
  const command = getConfig().cutout.command.trim();
  if (!command) return builtinProvider();
  const none = { python: '', modelFile: '', chosen: false };
  return { kind: 'command', words: splitCommand(command), command, ...none };
}

/**
 * The command line of one run.
 * @param {Provider} provider
 * @param {{ width: number, height: number, fps: number }} frames - What it will be sent
 * @returns {{ cmd: string, args: string[] }}
 */
export function matteCommand(provider, { width, height, fps }) {
  const size = ['--width', String(width), '--height', String(height), '--fps', String(fps)];
  return { cmd: provider.words[0] || '', args: [...provider.words.slice(1), ...size] };
}
