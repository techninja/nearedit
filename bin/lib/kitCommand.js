/**
 * `nearedit kit` — read a brand kit the way the editor does and say what
 * it holds: its tokens, its elements, its files, and everything that is
 * wrong with it. Reference: docs/app-spec/BRAND-API.md § Commands.
 * @module bin/lib/kitCommand
 */

import { kitElements } from '#utils/brand/index.js';
import { UsageError, parseArgs } from './args.js';
import { byLevel, describe } from './document.js';
import { loadKit } from './kitFolder.js';
import { fileUses, kitLines } from './kitReport.js';

const OPTIONS = {
  json: { type: /** @type {'flag'} */ ('flag') },
  library: { short: 'l', type: /** @type {'string'} */ ('string') },
};

/**
 * @param {string[]} argv
 * @param {{ out: (line: string) => void, err: (line: string) => void }} io
 * @returns {Promise<number>} Exit code: 0 the kit validates, 1 it does not
 */
export async function kitCommand(argv, io) {
  const { values, rest } = parseArgs(argv, OPTIONS, 'kit');
  if (rest.length !== 1)
    throw new UsageError('kit takes one kit: a kit folder, or builtin:<name>.', 'kit');
  const loaded = loadKit(rest[0], { library: values.library });
  const { errors, warnings } = byLevel(loaded.problems);
  const valid = errors.length === 0;
  if (values.json) {
    const { kit, effective, chain, key } = loaded;
    const plain = (/** @type {{ path: string, message: string }} */ { path, message }) => ({
      path,
      message,
    });
    const report = {
      ...{ kit: loaded.where, id: kit.id, name: kit.name || kit.id, description: kit.description },
      ...{ extends: kit.extends, chain, key, valid },
      ...{ tokens: effective.tokens, own: kit.tokens, fonts: effective.fonts },
      ...{ elements: kitElements(effective), defaults: effective.defaults },
      ...{ files: fileUses(loaded), errors: errors.map(plain), warnings: warnings.map(plain) },
    };
    io.out(JSON.stringify(report, null, 2));
    return valid ? 0 : 1;
  }
  for (const line of kitLines(loaded)) io.out(line);
  for (const line of describe([...errors, ...warnings])) io.out(line);
  const count = (/** @type {number} */ n, /** @type {string} */ word) =>
    `${n} ${word}${n === 1 ? '' : 's'}`;
  const found = [
    errors.length && count(errors.length, 'error'),
    warnings.length && count(warnings.length, 'warning'),
  ];
  const notes = found.filter(Boolean).join(', ');
  io.out(`${loaded.where}: ${valid ? 'valid' : 'invalid'}${notes ? ` (${notes})` : ''}`);
  return valid ? 0 : 1;
}
