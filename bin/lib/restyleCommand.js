/**
 * `nearedit restyle` — bring the element clips of a timeline, or of every
 * timeline in a folder, up to date with a brand kit: each gets the design
 * its element has in the kit now, and keeps what was filled in and
 * everything outside it. Reference: docs/app-spec/BRAND-API.md § Commands.
 * @module bin/lib/restyleCommand
 */

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { UsageError, parseArgs } from './args.js';
import { DocumentError, describe, parseFile } from './document.js';
import { loadKit } from './kitFolder.js';
import { kitFor, restyleDocument } from './restyleDocument.js';
import { outcomeLine, writeDocument } from './restyleOutput.js';

const OPTIONS = {
  kit: { short: 'k', type: /** @type {'string'} */ ('string') },
  library: { short: 'l', type: /** @type {'string'} */ ('string') },
  only: { type: /** @type {'list'} */ ('list') },
  output: { short: 'o', type: /** @type {'string'} */ ('string') },
  'dry-run': { type: /** @type {'flag'} */ ('flag') },
};

/** @type {(path: string) => boolean} */
const isFolder = (path) => existsSync(path) && statSync(path).isDirectory();
/** @type {(raw: any) => boolean} */
const isTimeline = (raw) => Array.isArray(Array.isArray(raw) ? raw : raw?.tracks);

/**
 * @param {string[]} argv
 * @param {{ out: (line: string) => void, err: (line: string) => void }} io
 * @returns {Promise<number>} Exit code: 0 done, 1 the kit does not validate
 *   or a timeline could not be read
 */
export async function restyleCommand(argv, io) {
  const { values, rest } = parseArgs(argv, OPTIONS, 'restyle');
  if (rest.length !== 1)
    throw new UsageError('restyle takes one timeline document, or one folder of them.', 'restyle');
  if (!values.kit)
    throw new UsageError('--kit is required: a kit folder, or builtin:<name>.', 'restyle');
  const target = resolve(rest[0]);
  const many = isFolder(target);
  if (many && values.output)
    throw new UsageError(
      '-o names one file: a folder of timelines is restyled in place.',
      'restyle',
    );
  const kit = loadKit(values.kit, { library: values.library });
  if (kit.problems.some((problem) => problem.level === 'error')) {
    for (const line of describe(kit.problems)) io.err(line);
    io.err(`${kit.where}: the kit does not validate — nothing was restyled`);
    return 1;
  }
  const only = values.only?.flatMap((/** @type {string} */ ids) => ids.split(',')).filter(Boolean);
  const unknown = (only || []).find((id) => !Object.hasOwn(kit.effective.elements, id));
  if (unknown) {
    const has = Object.keys(kit.effective.elements).join(', ');
    throw new UsageError(
      `--only ${unknown}: the kit has no such element. It has: ${has}.`,
      'restyle',
    );
  }
  const names = many ? readdirSync(target).filter((name) => /^[^.].*\.json$/i.test(name)) : [];
  const files = many ? names.sort().map((name) => join(target, name)) : [target];
  const dry = values['dry-run'] === true;
  const outside = new Set();
  let [changed, failed, seen] = [0, 0, 0];
  for (const file of files) {
    let raw;
    try {
      raw = parseFile(file);
    } catch (err) {
      if (!many || !(err instanceof DocumentError)) throw err;
      io.err(err.message);
      failed++;
      continue;
    }
    if (!isTimeline(raw)) {
      if (many) continue; // a song, a recipe, a kit: not a timeline, not our business
      throw new DocumentError(`${file} is not a timeline document: it needs a "tracks" array`);
    }
    const out = values.output ? resolve(values.output) : file;
    const dir = existsSync(dirname(out)) ? realpathSync(dirname(out)) : dirname(out);
    const { document, outcome } = restyleDocument(raw, kitFor(kit.effective, dir), { only });
    seen++;
    if (outcome.changed) changed++;
    for (const path of outcome.outside) outside.add(path);
    if (!dry && (outcome.changed || out !== file)) writeDocument(out, document);
    io.out(`${out}: ${outcomeLine(outcome, dry)}`);
  }
  if (many) {
    const what = `${seen} timeline${seen === 1 ? '' : 's'}`;
    io.out(`${target}: ${what}, ${changed} ${dry ? 'would change' : 'changed'}`);
  }
  if (outside.size && !dry)
    io.err(`The kit's files lie outside the timeline's folder: render with --media ${kit.dir}`);
  return failed ? 1 : 0;
}
