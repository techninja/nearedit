/**
 * What `nearedit restyle` says and writes: one line a document, and the
 * document itself — whole or not at all.
 * @module bin/lib/restyleOutput
 */

import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DocumentError } from './document.js';

/** @type {(tally: Record<string, number>) => number} */
const total = (tally) => Object.values(tally).reduce((sum, n) => sum + n, 0);

/**
 * One line for one document: `3 lower-third, 1 intro: updated; 2 already current`.
 * @param {import('./restyleDocument.js').Outcome} outcome
 * @param {boolean} dry
 * @returns {string}
 */
export function outcomeLine(outcome, dry) {
  const list = (/** @type {Record<string, number>} */ tally) =>
    Object.entries(tally)
      .map(([id, n]) => `${n} ${id}`)
      .join(', ');
  const parts = [
    total(outcome.updated) && `${list(outcome.updated)}: ${dry ? 'would be updated' : 'updated'}`,
    total(outcome.current) && `${total(outcome.current)} already current`,
    total(outcome.missing) && `${list(outcome.missing)}: not in the kit, left as they are`,
    total(outcome.skipped) && `${total(outcome.skipped)} left out by --only`,
  ].filter(Boolean);
  return parts.join('; ') || 'no element clips';
}

/**
 * Write a document beside its place, then move it there.
 * @param {string} file
 * @param {any} document
 * @throws {DocumentError} When it cannot be written; nothing is left behind
 */
export function writeDocument(file, document) {
  const part = join(dirname(file), `.${process.pid}.restyle.part`);
  try {
    writeFileSync(part, `${JSON.stringify(document, null, 2)}\n`);
    renameSync(part, file);
  } catch (err) {
    rmSync(part, { force: true }); // a failed write leaves nothing behind
    throw new DocumentError(`Cannot write ${file}: ${err.message}`);
  }
}
