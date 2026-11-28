/**
 * Putting a logo or a font into a kit folder, and taking one out. The
 * bytes of a request are written beside the place they are meant for and
 * renamed into it when all of them have arrived, so a reader never finds
 * half a file and two uploads of one name cannot mix. What is uploaded is
 * only ever stored and sent back as the kind of file its name says —
 * never run, never read as anything else.
 * Contract: docs/app-spec/BRAND-API.md § Files.
 * @module api/kits/upload
 */

import { randomBytes } from 'node:crypto';
import { createWriteStream, lstatSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { HttpError } from '../lib/httpErrors.js';
import { FILE_TYPES, MAX_FILE, MAX_FILES } from './limits.js';
import { fileKind, plainFileName, safeFileName } from './names.js';

const PART = '.part';
/** A part file this old belongs to an upload that died. */
const ORPHAN_AGE_MS = 60 * 60 * 1000;
const megabytes = Math.round(MAX_FILE / (1024 * 1024));
const tooLarge = () => new HttpError(413, `A kit file may be at most ${megabytes} MB`);

/**
 * @param {string} path
 * @returns {import('node:fs').Stats|null} null when nothing is there; a link is not followed
 */
function lookAt(path) {
  try {
    return lstatSync(path);
  } catch {
    return null; // nothing there
  }
}

/**
 * Make sure a kit folder is there to be written into.
 * @param {string} dir
 * @throws {HttpError} 409 when something that is not a folder is in its place
 */
export function prepareFolder(dir) {
  const stat = lookAt(dir);
  if (stat && !stat.isDirectory()) {
    throw new HttpError(409, 'The kit folder is a link or a file: the server does not write there');
  }
  if (!stat) mkdirSync(dir, { recursive: true });
}

/**
 * Count the files of a folder and clear what dead uploads left in it.
 * @param {string} dir
 * @returns {number} Logo and font files directly in the folder
 */
function tidy(dir) {
  let files = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.startsWith('.') && fileKind(entry.name)) files++;
    if (!entry.name.startsWith('.') || !entry.name.endsWith(PART)) continue;
    const stat = lookAt(join(dir, entry.name));
    if (stat && Date.now() - stat.mtimeMs > ORPHAN_AGE_MS) {
      rmSync(join(dir, entry.name), { force: true });
    }
  }
  return files;
}

/**
 * The body of a request as chunks, counted: more than a kit file may hold
 * ends it. The request itself is left open, so the refusal can be answered.
 * @param {import('node:http').IncomingMessage} req
 * @param {{ size: number }} count - Filled in as the bytes arrive
 * @returns {AsyncGenerator<Buffer>}
 */
async function* measured(req, count) {
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    count.size += chunk.length;
    if (count.size > MAX_FILE) throw tooLarge();
    yield chunk;
  }
}

/**
 * Store the body of a request as a file of a kit folder.
 * @param {import('node:http').IncomingMessage} req - Its body is the file
 * @param {string} dir - The kit folder; created when it is not there
 * @param {unknown} rawName - The name the client gave; reduced to a safe one
 * @returns {Promise<{ name: string, size: number }>} The name it was stored under
 * @throws {HttpError} 422 for a name that cannot be used, 413 for too many
 *   bytes, 409 for a full folder, 400 for no bytes or an upload that broke off
 */
export async function saveFile(req, dir, rawName) {
  const name = safeFileName(rawName);
  if (!name) {
    const fields = { name: `Must be a logo or a font file: ${FILE_TYPES.join(', ')}` };
    throw new HttpError(422, 'Not a file a kit can hold', { fields });
  }
  if (Number(req.headers['content-length']) > MAX_FILE) throw tooLarge();
  prepareFolder(dir);
  const target = join(dir, name);
  const there = lookAt(target);
  if (there?.isDirectory()) throw new HttpError(409, `"${name}" is a folder in this kit`);
  if (!there && tidy(dir) >= MAX_FILES) {
    throw new HttpError(409, `A kit holds at most ${MAX_FILES} files: remove one first`);
  }
  const part = join(dir, `.${name}.${randomBytes(6).toString('hex')}${PART}`);
  const count = { size: 0 };
  try {
    await pipeline(measured(req, count), createWriteStream(part, { flags: 'wx' }));
    if (!count.size)
      throw new HttpError(400, 'The request has no body: send the bytes of the file');
    renameSync(part, target);
  } catch (err) {
    rmSync(part, { force: true });
    // Whatever is still on its way is read and dropped, so the answer gets through.
    if (!req.destroyed) req.resume();
    if (err instanceof HttpError) throw err;
    if (req.destroyed || !req.complete) throw new HttpError(400, 'The upload broke off');
    throw err;
  }
  return { name, size: count.size };
}

/**
 * Remove a file from a kit folder.
 * @param {string} dir - The kit folder
 * @param {unknown} rawName - The file's name, as `files` lists it
 * @throws {HttpError} 404 when the folder holds no such file
 */
export function removeFile(dir, rawName) {
  const name = plainFileName(rawName);
  const stat = name ? lookAt(join(dir, name)) : null;
  if (!stat || stat.isDirectory()) throw new HttpError(404, 'File not found in this kit');
  rmSync(join(dir, name), { force: true }); // a link is removed, never what it points at
}
