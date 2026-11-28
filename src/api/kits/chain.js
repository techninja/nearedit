/**
 * From a kit to everything it rests on: the chain a kit's `extends` leads
 * through — a project's own kit, kits of the library, a built-in kit at
 * the root. A chain that cannot be followed (a kit that is not there, a
 * loop, too many kits) is cut where it breaks and set on `builtin:clean`,
 * with a problem that says so: one broken kit never takes the others down.
 * Contract: docs/app-spec/BRAND-API.md § Effective kits.
 * @module api/kits/chain
 */

import { join, resolve } from 'node:path';
import {
  BUILTIN_KITS,
  BUILTIN_PREFIX,
  DEFAULT_KIT,
  LIMITS,
  builtinKit,
} from '#utils/brand/index.js';
import { getConfig } from '../lib/config.js';
import { readKitFolder } from './folder.js';
import { PROJECT_CHOICE } from './limits.js';
import { parseRef } from './names.js';

/** @typedef {import('#utils/brand/types.js').Problem} Problem */
/** @typedef {import('./names.js').KitRef} KitRef */

/**
 * One kit of a chain.
 * @typedef {Object} Link
 * @property {string} ref - `project`, a library id, or `builtin:<name>`
 * @property {'builtin'|'library'|'project'} source
 * @property {import('./folder.js').StoredKit} kit - As it is stored
 * @property {string} dir - Its folder; '' for a built-in kit
 * @property {Problem[]} problems - What is wrong with it as it was written
 * @property {string[]} refs - The files it names
 * @property {string} stamp - Changes when the kit does
 */

/** The name of the built-in kit every broken chain is set on. */
export const FALLBACK = `${BUILTIN_PREFIX}${DEFAULT_KIT}`;

/** @type {Map<string, Link>} */
const builtins = new Map();

/**
 * @param {string} id - A library id
 * @returns {string} The folder of that kit of the library
 */
export function libraryKitDir(id) {
  return join(getConfig().kitsDir, id);
}

/**
 * @param {string} projectDir
 * @returns {string} The folder of a project's own kit
 */
export function projectKitDir(projectDir) {
  return resolve(projectDir, '.nearedit', 'kit');
}

/**
 * @param {string} id - `clean`, `bold`…
 * @returns {Link|null}
 */
function builtinLink(id) {
  const model = builtinKit(id);
  if (!model) return null;
  if (!builtins.has(id)) {
    const description = BUILTIN_KITS.find((kit) => kit.id === id)?.description || '';
    const ref = `${BUILTIN_PREFIX}${id}`;
    const [problems, refs] = [[], []];
    builtins.set(id, {
      ...{ ref, dir: '', problems, refs, stamp: 'builtin' },
      source: 'builtin',
      kit: { ...model, description },
    });
  }
  return builtins.get(id);
}

/**
 * Open the kit a name means.
 * @param {KitRef|null} ref
 * @param {string} [projectDir] - Needed for a project's own kit
 * @returns {Link|null} null when there is no such kit
 */
export function openKit(ref, projectDir = '') {
  if (!ref) return null;
  if (ref.source === 'builtin') return builtinLink(ref.id);
  if (ref.source === 'project' && !projectDir) return null;
  const dir = ref.source === 'project' ? projectKitDir(projectDir) : libraryKitDir(ref.id);
  const folder = readKitFolder(dir, ref.id);
  return folder && { ref: ref.ref, source: ref.source, ...folder };
}

/**
 * Follow a kit's `extends` down to a built-in kit.
 * @param {Link} head - The kit to start from
 * @param {(ref: KitRef) => Link|null} [open] - Where the kits it names are
 *   looked for: the library, unless the caller keeps its kits elsewhere
 * @returns {{ links: Link[], problems: Problem[] }} The chain, child first,
 *   always ending in a built-in kit, and what had to be cut on the way
 */
export function followChain(head, open = openKit) {
  const links = [head];
  /** @type {Problem[]} */
  const problems = [];
  const seen = new Set([head.ref]);
  for (let at = head; at.source !== 'builtin'; at = links[links.length - 1]) {
    const named = at.kit.extends || FALLBACK;
    const ref = parseRef(named);
    // A project's own kit is the end of a chain, never the middle of one.
    let next = ref && ref.ref !== PROJECT_CHOICE ? open(ref) : null;
    let why = next ? '' : `extends "${named}", which was not found`;
    if (next && seen.has(next.ref)) why = `extends itself by way of "${next.ref}"`;
    else if (next && next.source !== 'builtin' && links.length >= LIMITS.depth - 1) {
      why = `has more than ${LIMITS.depth} kits in its chain`;
    }
    if (why) {
      const message = `Kit "${at.ref}" ${why}: ${FALLBACK} is used in its place`;
      problems.push({ path: 'extends', message, level: 'error' });
      next = builtinLink(DEFAULT_KIT);
    }
    seen.add(next.ref);
    links.push(next);
  }
  return { links, problems };
}
