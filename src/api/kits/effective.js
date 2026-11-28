/**
 * Effective kits — what a kit amounts to once its chain is resolved
 * (a project's own → the library → a built-in), with every logo and font
 * file as an absolute path the media route serves and the renderer may
 * read. This is what the editor hands to `insertElement`, `restyle` and
 * `staleElements`, and what the director reads its look from.
 *
 * Results are kept per kit and reused for as long as nothing they were
 * made from has changed: every `kit.json` of the chain and every file it
 * names is looked at (not read) on each call, so an answer is never stale.
 * Contract: docs/app-spec/BRAND-API.md § Effective kits.
 * @module api/kits/effective
 */

import {
  DEFAULT_KIT,
  KitError,
  builtinKit,
  kitKey,
  resolveKit,
  validateKit,
} from '#utils/brand/index.js';
import { FALLBACK, followChain, openKit } from './chain.js';
import { locateFiles, withAbsoluteFiles } from './files.js';
import { parseRef } from './names.js';

/** @typedef {import('#utils/brand/types.js').Problem} Problem */
/** @typedef {import('./chain.js').Link} Link */

/**
 * A kit, resolved.
 * @typedef {Object} Resolved
 * @property {string} ref - The kit at the head of the chain: `project`, a
 *   library id, or `builtin:<name>`
 * @property {'builtin'|'library'|'project'} source - Where that kit lives
 * @property {string} dir - Its folder; '' for a built-in kit
 * @property {import('./folder.js').StoredKit} kit - That kit as it is stored
 * @property {import('#utils/brand/types.js').Kit} effective - Complete, files
 *   as absolute paths. Shared: never change it
 * @property {string} key - `kitKey(effective)`
 * @property {string[]} chain - The kits it was made from, child first
 * @property {Problem[]} problems - Errors and warnings, each with its path
 */

/** Kits whose resolution is kept; the least recently made go first. */
const MAX_CACHED = 256;
/** @type {Map<string, { stamp: string, resolved: Resolved }>} */
const cache = new Map();

/**
 * Resolve the chain that starts at a kit.
 * @param {Link} head - From `openKit`, or a kit that is about to be written
 * @param {{ cache?: boolean, open?: Parameters<typeof followChain>[1] }} [opts] -
 *   `cache: false` for a kit that is not on disk as given; `open` to look
 *   for the kits it extends somewhere other than the library
 * @returns {Resolved}
 */
export function resolveFrom(head, opts = {}) {
  const { links, problems: cut } = followChain(head, opts.open);
  const located = links.map((link) => (link.dir ? locateFiles(link.dir, link.refs) : null));
  const stamp = links.map((link, i) => `${link.ref}@${link.stamp}#${located[i]?.sig}`).join('\n');
  const slot = `${head.source}:${head.dir || head.ref}`;
  const hit = opts.cache === false ? undefined : cache.get(slot);
  if (hit?.stamp === stamp) return hit.resolved;

  /** @type {Problem[]} */
  const problems = [...head.problems];
  const models = links.map((link, i) => {
    if (!located[i]) return builtinKit(link.kit.id);
    const mapped = withAbsoluteFiles(link.kit, located[i].found);
    if (link === head) problems.push(...mapped.problems);
    return mapped.kit;
  });
  problems.push(...cut);
  let effective;
  try {
    effective = resolveKit(models);
  } catch (err) {
    if (!(err instanceof KitError)) throw err;
    problems.push({
      path: 'extends',
      message: `${err.message}: ${FALLBACK} is used`,
      level: 'error',
    });
    effective = resolveKit(builtinKit(DEFAULT_KIT));
  }
  // Only what shows once the kit is complete: contrast, families without a file.
  problems.push(...validateKit({ id: head.kit.id }, { effective }).problems);
  const resolved = {
    ...{ ref: head.ref, source: head.source, dir: head.dir, kit: head.kit },
    ...{ effective, key: kitKey(effective), chain: links.map((link) => link.ref), problems },
  };
  if (opts.cache !== false) {
    cache.delete(slot);
    cache.set(slot, { stamp, resolved });
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
  }
  return resolved;
}

/**
 * The effective kit a choice means: the server function everything that
 * needs a brand calls.
 * @param {unknown} choice - A library id, `builtin:<name>`, or `project`
 *   for the kit in `<projectDir>/.nearedit/kit/`; anything else, and
 *   nothing, means `builtin:clean`
 * @param {string} [projectDir] - The project's folder, for `project`
 * @returns {Resolved} Always a usable kit: a choice that cannot be found
 *   falls back to `builtin:clean` and says so in `problems` (path `choice`)
 */
export function effectiveKit(choice, projectDir = '') {
  const wanted = choice === undefined || choice === null || choice === '' ? FALLBACK : choice;
  const head = openKit(parseRef(wanted), projectDir);
  if (head) return resolveFrom(head);
  const fallback = resolveFrom(openKit(parseRef(FALLBACK)));
  const message = `Kit ${JSON.stringify(wanted)} was not found: ${FALLBACK} is used`;
  return {
    ...fallback,
    problems: [{ path: 'choice', message, level: 'error' }, ...fallback.problems],
  };
}
