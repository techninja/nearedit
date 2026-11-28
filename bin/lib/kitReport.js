/**
 * A kit laid out for a terminal: where it comes from, its tokens group by
 * group, its elements with their slots, its files and what uses each.
 * @module bin/lib/kitReport
 */

import { relative } from 'node:path';
import { TOKEN_SCHEMA, kitElements, mapKitFiles } from '#utils/brand/index.js';
import { isInside } from '../../src/api/lib/paths.js';

/** @typedef {import('./kitFolder.js').LoadedKit} LoadedKit */

/**
 * @param {number} bytes
 * @returns {string} `13 KB`, `1.2 MB`
 */
function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * One token as text.
 * @param {any} value
 * @param {string} type - Its type in the schema
 * @param {string} dir - The kit's folder: its own files are named from there
 * @returns {string}
 */
function shown(value, type, dir) {
  if (type === 'image' && value && dir && isInside(dir, value)) return relative(dir, value);
  if (type !== 'font') return value === '' || value === undefined ? '—' : String(value);
  const { family, weight, ...more } = value || {};
  const extras = Object.entries(more).map(([key, v]) => (v === true ? key : `${key} ${v}`));
  return [family, weight, ...extras].filter((part) => part !== undefined).join(' ');
}

/**
 * The files of a kit folder with the places of the kit that name each.
 * @param {LoadedKit} loaded
 * @returns {{ name: string, size: number, used: string[] }[]}
 */
export function fileUses(loaded) {
  /** @type {Map<string, string[]>} */
  const uses = new Map();
  mapKitFiles(loaded.kit, (ref, where) => {
    const name = ref.replace(/^\.\//, '');
    uses.set(name, [...(uses.get(name) || []), where]);
    return ref;
  });
  return loaded.files.map((file) => ({ ...file, used: uses.get(file.name) || [] }));
}

/**
 * @param {LoadedKit} loaded
 * @returns {string[]} The report, line by line, without the problems
 */
export function kitLines(loaded) {
  const { kit, effective, chain, key } = loaded;
  const lines = [`${kit.name || kit.id} (${kit.id}) — ${loaded.where}`];
  if (kit.description) lines.push(`  ${kit.description}`);
  lines.push(`  chain: ${chain.join(' → ')}`, `  key:   ${key}`, '');
  lines.push('Tokens — * set by this kit, the rest inherited');
  for (const [group, specs] of Object.entries(TOKEN_SCHEMA)) {
    const values = Object.entries(specs).map(([name, spec]) => {
      const own = Object.hasOwn(kit.tokens[group] || {}, name) ? '*' : '';
      return `${name}${own} ${shown(effective.tokens[group]?.[name], spec.type, loaded.dir)}`;
    });
    lines.push(`  ${group.padEnd(7)} ${values.join(', ')}`);
  }
  lines.push('', 'Elements — * defined by this kit');
  for (const element of kitElements(effective)) {
    const slots = element.slots.map((slot) => `${slot.name}${slot.optional ? '?' : ''}`);
    const name = `${element.id}${Object.hasOwn(kit.elements, element.id) ? '*' : ''}`;
    const what = `${element.kind}, ${element.duration} s`;
    lines.push(`  ${name.padEnd(16)} ${what.padEnd(18)} ${slots.join(', ') || '—'}`);
  }
  const files = fileUses(loaded);
  if (files.length) lines.push('', 'Files');
  for (const file of files) {
    const used = file.used.length ? file.used.join(', ') : 'not used by the kit';
    lines.push(`  ${file.name.padEnd(28)} ${size(file.size).padStart(8)}  ${used}`);
  }
  return [...lines, ''];
}
