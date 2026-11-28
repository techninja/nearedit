/**
 * Inheritance — from a chain of kits to the **effective kit**. Tokens are
 * merged key by key, the child winning; elements and defaults are
 * inherited and replaced by name; font files are joined. The root of every
 * chain is a built-in kit, so an effective kit is always complete; colours
 * a kit may leave to be derived (`onPrimary`…) are filled in last.
 * Isomorphic and pure. Contract: docs/app-spec/BRAND.md § A kit.
 * @module utils/brand/resolve
 */

import { readableOn } from './color.js';
import { mergeFonts } from './fontTable.js';
import { builtinKit } from './kits/index.js';
import { BUILTIN_PREFIX, DEFAULT_KIT, LIMITS } from './limits.js';
import { mergeTokens } from './tokenClean.js';
import { TOKEN_SCHEMA, defaultTokens } from './tokens.js';

/** @typedef {import('./types.js').Kit} Kit */

/** A chain that cannot be resolved: a loop, too long, a kit that is missing. */
export class KitError extends Error {}

/**
 * The built-in kit a kit rests on.
 * @param {Kit} kit - The last kit of a chain that is not itself built in
 * @returns {Kit}
 * @throws {KitError} When it names a built-in kit that does not exist
 */
function rootOf(kit) {
  const named = kit.extends?.startsWith(BUILTIN_PREFIX);
  const id = named ? kit.extends.slice(BUILTIN_PREFIX.length) : DEFAULT_KIT;
  const root = builtinKit(id);
  if (!root) throw new KitError(`Kit "${kit.id}" extends "${kit.extends}": no such built-in kit`);
  return root;
}

/** @type {(kit: Kit) => boolean} */
const isBuiltin = (kit) => builtinKit(kit?.id) === kit;

/**
 * Follow `extends` from a kit down to its built-in root.
 * @param {Kit} kit - Normalised (`normalizeKit`)
 * @param {(id: string) => Kit|null|undefined} [lookup] - A kit of the library by id
 * @returns {Kit[]} The chain, child first, ending in a built-in kit
 * @throws {KitError} For a loop, a chain longer than five, or a kit that is not found
 */
export function kitChain(kit, lookup = () => null) {
  const chain = [kit];
  const seen = new Set([kit.id]);
  for (let at = kit; !isBuiltin(at); ) {
    const next =
      !at.extends || at.extends.startsWith(BUILTIN_PREFIX) ? rootOf(at) : lookup(at.extends);
    if (!next) throw new KitError(`Kit "${at.id}" extends "${at.extends}", which was not found`);
    if (!isBuiltin(next) && seen.has(next.id)) {
      throw new KitError(`Kit "${kit.id}" extends itself by way of "${next.id}"`);
    }
    if (chain.length >= LIMITS.depth) {
      throw new KitError(`Kit "${kit.id}" has more than ${LIMITS.depth} kits in its chain`);
    }
    seen.add(next.id);
    chain.push(next);
    at = next;
  }
  return chain;
}

/**
 * The colours a kit left to be derived: black or white, whichever reads on
 * the colour they are written on.
 * @param {Record<string, Record<string, any>>} tokens - Complete but for these
 * @returns {Record<string, Record<string, any>>}
 */
function withDerived(tokens) {
  const color = { ...tokens.color };
  for (const [name, spec] of Object.entries(TOKEN_SCHEMA.color)) {
    if (spec.derived && !color[name]) color[name] = readableOn(color[spec.derived]);
  }
  return { ...tokens, color };
}

/**
 * Resolve a chain into the effective kit.
 * @param {Kit|Kit[]} chain - Child first: a kit, what it extends, and so on.
 *   A chain that does not end in a built-in kit has the one its last kit
 *   names (or `clean`) added
 * @returns {Kit} Complete: every token, every standard element; `chain`
 *   lists the ids it was made from and `extends` is ''
 * @throws {KitError} For a loop or a chain longer than five
 */
export function resolveKit(chain) {
  const given = (Array.isArray(chain) ? chain : [chain]).filter(Boolean);
  if (!given.length) return resolveKit(builtinKit(DEFAULT_KIT));
  const last = given[given.length - 1];
  const kits = isBuiltin(last) ? given : [...given, rootOf(last)];
  const ids = kits.map((kit) => kit.id);
  if (kits.length > LIMITS.depth) {
    throw new KitError(`A chain of ${kits.length} kits is longer than ${LIMITS.depth}`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new KitError(`Kit "${ids[0]}" extends itself: ${ids.join(' → ')}`);
  }
  const [child] = kits;
  const backwards = [...kits].reverse();
  return {
    id: child.id,
    name: child.name || child.id,
    extends: '',
    chain: ids,
    tokens: withDerived(mergeTokens([...kits.map((kit) => kit.tokens), defaultTokens()])),
    fonts: mergeFonts(...kits.map((kit) => kit.fonts)),
    elements: Object.assign({}, ...backwards.map((kit) => kit.elements)),
    defaults: Object.assign({}, ...backwards.map((kit) => kit.defaults)),
  };
}
