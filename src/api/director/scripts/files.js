/**
 * Edit-script files — Markdown scripts live in the project's `scripts/`
 * folder, one sub-folder per adaptation, so they show up as text media
 * and can be edited by hand before they are executed.
 * @module api/director/scripts/files
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { checkMediaPath } from '../../lib/paths.js';
import { DirectorError } from '../errors.js';

const SCRIPT_EXTS = ['.md', '.txt'];
const MAX_SCRIPT_BYTES = 256 * 1024;

/**
 * A folder-safe name.
 * @param {string} name
 * @returns {string}
 */
export function slug(name) {
  const cleaned = String(name || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return cleaned.slice(0, 60) || 'main';
}

/**
 * `<project>/scripts/<adaptation>/`.
 * @param {string} projectDir
 * @param {string} adaptationName
 * @returns {string}
 */
export function scriptsDir(projectDir, adaptationName) {
  return join(projectDir, 'scripts', slug(adaptationName));
}

/**
 * Sortable local timestamp for file names: 20251228-2154.
 * @param {Date} [now]
 * @returns {string}
 */
export function fileStamp(now = new Date()) {
  const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  return `${date}-${two(now.getHours())}${two(now.getMinutes())}`;
}

/**
 * Write a script without ever overwriting an existing file.
 * @param {string} dir
 * @param {string} name - File name without extension
 * @param {string} text
 * @returns {{ filename: string, filePath: string }}
 */
export function saveScript(dir, name, text) {
  mkdirSync(dir, { recursive: true });
  let filename = `${name}.md`;
  for (let n = 2; existsSync(join(dir, filename)); n++) filename = `${name}-${n}.md`;
  const filePath = join(dir, filename);
  writeFileSync(filePath, text);
  return { filename, filePath };
}

/**
 * Check where an `execute_script` directive gets its script from, so a bad
 * path is refused before a job starts.
 * @param {import('#utils/director/directive.js').Directive} directive
 * @throws {DirectorError} 403/404 for a bad path, 422 when there is no script at all
 */
export function checkScriptSource(directive) {
  const path = directive.params.scriptPath;
  if (directive.prompt) return;
  if (!path)
    throw new DirectorError('No script to execute', {
      status: 422,
      fields: { prompt: 'Paste the approved script or choose a script file' },
    });
  const checked = checkMediaPath(path);
  if (checked.ok === false) throw new DirectorError(checked.error, { status: checked.status });
  const bad = (/** @type {string} */ why) =>
    new DirectorError('Not a usable script file', {
      status: 422,
      fields: { 'params.scriptPath': why },
    });
  if (!SCRIPT_EXTS.includes(extname(checked.path).toLowerCase()))
    throw bad('must be a .md or .txt file');
  if (statSync(checked.path).size > MAX_SCRIPT_BYTES) throw bad('the file is larger than 256 KB');
}

/**
 * The script text of an `execute_script` directive: the prompt when it is
 * given, else the script file.
 * @param {import('#utils/director/directive.js').Directive} directive
 * @returns {string}
 */
export function loadScript(directive) {
  checkScriptSource(directive);
  if (directive.prompt) return directive.prompt;
  return readFileSync(directive.params.scriptPath, 'utf-8');
}
