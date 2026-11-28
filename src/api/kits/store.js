/**
 * Storing a kit, and saying what a stored kit is. A kit is written only
 * when it validates as it would resolve — against the chain it names, with
 * the files its folder holds — and it is written whole or not at all:
 * beside its place first, then renamed into it.
 * Contract: docs/app-spec/BRAND-API.md § Routes.
 * @module api/kits/store
 */

import { randomBytes } from 'node:crypto';
import { lstatSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { kitFiles } from '#utils/brand/index.js';
import { HttpError } from '../lib/httpErrors.js';
import { resolveFrom } from './effective.js';
import { InvalidKit, hasErrors } from './errors.js';
import { listFiles } from './files.js';
import { readKit } from './folder.js';
import { KIT_FILE, MAX_KIT_JSON } from './limits.js';
import { prepareFolder } from './upload.js';

/** @typedef {import('./effective.js').Resolved} Resolved */

/** The colours a list of kits shows each kit by. */
const SWATCHES = ['background', 'surface', 'primary', 'accent', 'text'];
const tooLarge = () => new HttpError(413, `A ${KIT_FILE} may be at most ${MAX_KIT_JSON / 1024} KB`);

/**
 * A kit as `GET /kits/:id` answers.
 * @param {Resolved} resolved
 * @returns {{ id: string, source: string, kit: object, effective: object, key: string,
 *   chain: string[], files: { name: string, size: number }[], problems: object[] }}
 */
export function describe(resolved) {
  const { ref: id, source, kit, effective, key, chain, problems, dir } = resolved;
  return { id, source, kit, effective, key, chain, files: dir ? listFiles(dir) : [], problems };
}

/**
 * A kit as one entry of `GET /kits`.
 * @param {Resolved} resolved
 * @returns {{ id: string, name: string, description: string, source: string, extends: string,
 *   key: string, colors: Record<string, string>, elements: number, problems: number }}
 */
export function summarize(resolved) {
  const { ref: id, source, kit, effective, key, problems } = resolved;
  const color = effective.tokens.color || {};
  return {
    ...{ id, name: kit.name || kit.id, description: kit.description, source },
    ...{ extends: kit.extends, key },
    colors: Object.fromEntries(SWATCHES.map((name) => [name, color[name]])),
    elements: Object.keys(effective.elements).length,
    problems: problems.length,
  };
}

/**
 * @param {string} file - Where the text belongs
 * @param {string} text
 */
function writeWhole(file, text) {
  const part = join(dirname(file), `.${KIT_FILE}.${randomBytes(6).toString('hex')}.part`);
  try {
    writeFileSync(part, text, { flag: 'wx' });
    renameSync(part, file);
  } catch (err) {
    rmSync(part, { force: true }); // a failed write leaves nothing behind
    throw err;
  }
}

/**
 * Validate a kit and store it as its folder's `kit.json`.
 * @param {import('./names.js').KitRef} ref - The kit it becomes
 * @param {string} dir - Its folder; created when it is not there
 * @param {unknown} raw - The kit as it was sent
 * @returns {Resolved} The kit as it resolved before it was stored: its
 *   `problems` also hold the warnings about what was sent and not kept
 * @throws {InvalidKit} 422 when it has an error — nothing is written
 * @throws {HttpError} 413 when it is too large, 409 when its place is taken
 */
export function writeKit(ref, dir, raw) {
  if (Buffer.byteLength(JSON.stringify(raw) ?? '') > MAX_KIT_JSON) throw tooLarge();
  const { kit, problems } = readKit(raw, ref.id);
  const head = { ...{ ref: ref.ref, source: ref.source, dir, kit, problems }, stamp: 'unsaved' };
  const candidate = resolveFrom({ ...head, refs: kitFiles(kit) }, { cache: false });
  if (hasErrors(candidate.problems)) throw new InvalidKit(candidate.problems);
  // What is stored is what the model keeps of it: bounded, and the same when read back.
  const pretty = `${JSON.stringify(kit, null, 2)}\n`;
  const text = Buffer.byteLength(pretty) > MAX_KIT_JSON ? JSON.stringify(kit) : pretty;
  if (Buffer.byteLength(text) > MAX_KIT_JSON) throw tooLarge();
  prepareFolder(dir);
  const file = join(dir, KIT_FILE);
  let taken = false;
  try {
    taken = lstatSync(file).isDirectory();
  } catch {
    taken = false; // not there yet
  }
  if (taken) throw new HttpError(409, `${KIT_FILE} is a folder in this kit`);
  writeWhole(file, text);
  return candidate;
}
