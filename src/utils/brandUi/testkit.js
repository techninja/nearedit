/**
 * Fixtures for tests of the brand in the editor: a complete built-in kit,
 * a document with element clips, and what a kit route answers about a kit
 * (for the stand-in server, `fakeKitServer.js`). Not part of the runtime
 * API — import it from tests.
 * @module utils/brandUi/testkit
 */

import { builtinKit, kitKey, normalizeKit, resolveKit } from '#utils/brand/index.js';
import { insertElement } from '#utils/edl/index.js';
import { newClipIds } from '#utils/edl/selection.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';

/** A built-in kit, complete. @param {string} [id] @returns {import('#utils/brand/types.js').Kit} */
export const kitOf = (id = 'clean') => resolveKit(builtinKit(id));

/**
 * A document with footage and element clips made from a kit.
 * @param {[string, Record<string, string>, number][]} elements - `[element id, slots, time]`
 * @param {import('#utils/brand/types.js').Kit} [kit]
 * @returns {{ doc: any, clipIds: string[] }} The element clips' ids, in the order given
 */
export function elementDoc(elements, kit = kitOf()) {
  let doc = testEdl({ v1: [testClip('talk', 0, 8), testClip('park', 8, 14)], a1: [] });
  const clipIds = elements.map(([id, slots, time]) => {
    const next = insertElement(doc, kit, id, slots, { time, ripple: false });
    const [clipId] = newClipIds(doc, next);
    doc = next;
    return clipId;
  });
  return { doc, clipIds };
}

/**
 * What a kit route answers about one kit of a fake server's state: the kit
 * as stored and resolved through its chain with the real model, its files
 * as paths of its folder (`/kits/<id>/<name>`).
 * @param {{ own: any, library: Record<string, any> }} state
 * @param {Record<string, string[]>} files - File names by kit
 * @param {string} ref - `builtin:<name>`, a library id, or `project`
 * @returns {any} null when there is no such kit
 */
export function kitAnswer(state, files, ref) {
  if (ref.startsWith('builtin:')) {
    const effective = resolveKit(builtinKit(ref));
    const head = { id: ref, source: 'builtin', kit: builtinKit(ref), effective };
    return { ...head, key: kitKey(effective), chain: [ref], files: [], problems: [] };
  }
  const stored = ref === 'project' ? state.own : state.library[ref];
  if (!stored) return null;
  const kit = normalizeKit({ ...stored, id: ref });
  const at = (/** @type {string} */ name) => `/kits/${ref}/${name}`;
  const logo = { ...kit.tokens.logo };
  for (const slot of ['main', 'mark'].filter((key) => logo[key])) logo[slot] = at(logo[slot]);
  const mine = {
    ...kit,
    tokens: { ...kit.tokens, ...(kit.tokens.logo && { logo }) },
    fonts: kit.fonts.map((face) => ({ ...face, file: at(face.file) })),
  };
  const parent = kitAnswer(state, files, kit.extends || 'builtin:clean')?.effective;
  const resolved = resolveKit([
    { ...mine, id: `${ref}-kit` },
    { ...parent, id: `${ref}-base`, extends: '' },
  ]);
  const effective = { ...resolved, id: ref, name: stored.name || ref };
  return {
    ...{ id: ref, source: ref === 'project' ? 'project' : 'library' },
    ...{ kit: { ...kit, name: stored.name || '' }, effective, key: kitKey(effective) },
    chain: [ref, kit.extends],
    files: (files[ref] || []).map((name) => ({ name, size: 3 })),
    problems: [],
  };
}
