/**
 * The kits a project can choose from, for the Brand dialog: the list from
 * the server (the built-in kits stand in when it cannot be read), each
 * kit's complete form for drawing its picture, choosing one for the open
 * project and removing one from the library.
 * @module utils/brandUi/kitList
 */

import {
  BUILTIN_KITS,
  BUILTIN_PREFIX,
  builtinKit,
  kitKey,
  resolveKit,
} from '#utils/brand/index.js';
import { createObservable } from '#utils/ui/observable.js';
import { brandDialog } from './dialogState.js';
import { chooseProjectKit, listKits, readKit, removeKit } from './kitApi.js';
import { forOpenAdaptation } from './kitLoad.js';
import { acceptKit, isKitAnswer, kitState } from './kitState.js';
import { forgetOwnKit } from './ownKit.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */
/** @typedef {import('./kitApi.js').KitEntry} KitEntry */

/** @type {Map<string, Kit>} Built-in kits, complete */
const builtins = new Map();

/**
 * Complete kits by `id|key`, for the pictures of the list.
 * @type {import('#utils/ui/observable.js').Observable<{ byKit: Record<string, Kit> }>}
 */
export const kitPictures = createObservable({ byKit: {} });
/** @type {Set<string>} Kits being read */
const asked = new Set();

/**
 * @param {string} id - `builtin:clean` or `clean`
 * @returns {Kit|null} A built-in kit, complete; the same object every time
 */
export function builtinEffective(id) {
  const kit = builtinKit(id);
  if (!kit) return null;
  if (!builtins.has(kit.id)) builtins.set(kit.id, resolveKit(kit));
  return builtins.get(kit.id);
}

/** @returns {KitEntry[]} The built-in kits as the server would list them */
export function builtinEntries() {
  return BUILTIN_KITS.map(({ id, name, description }) => {
    const kit = builtinEffective(id);
    return {
      ...{ id: `${BUILTIN_PREFIX}${id}`, name, description, extends: '', key: kitKey(kit) },
      source: /** @type {'builtin'} */ ('builtin'),
      colors: kit.tokens.color,
      elements: Object.keys(kit.elements).length,
      problems: 0,
    };
  });
}

/**
 * The complete kit behind an entry of the list, to draw its picture with.
 * A library kit is read from the server the first time it is asked for;
 * until it arrives there is none.
 * @param {KitEntry} entry
 * @param {Record<string, Kit>} [seen] - The kits that have arrived (`kitPictures`)
 * @returns {Kit|null}
 */
export function pictureKit(entry, seen = kitPictures.get().byKit) {
  if (entry.source === 'builtin') return builtinEffective(entry.id);
  const slot = `${entry.id}|${entry.key}`;
  const known = seen[slot];
  if (known || asked.has(slot)) return known || null;
  asked.add(slot);
  readKit(entry.id)
    .then((answer) => {
      if (!isKitAnswer(answer)) return;
      kitPictures.set((state) => ({ byKit: { ...state.byKit, [slot]: answer.effective } }));
    })
    .catch((err) => console.warn(`[brand] kit "${entry.id}" could not be read:`, err.message));
  return null;
}

/** Read the list of kits. A failure shows the built-in kits and says why. */
export async function loadKits() {
  brandDialog.set({ list: 'loading' });
  try {
    brandDialog.set({ kits: await listKits(), list: 'ready' });
  } catch (err) {
    console.warn('[brand] the kits could not be listed:', err.message);
    // The dialog says what that means; the reason is in the console.
    brandDialog.set({ kits: builtinEntries(), list: 'failed' });
  }
}

/**
 * Choose a kit for the open project.
 * @param {string} id - A library id, `builtin:<name>`, or `project`
 * @returns {Promise<boolean>} true when it is now the project's kit
 */
export async function chooseKit(id) {
  const { projectId, choice } = kitState.get();
  if (!projectId || id === choice || brandDialog.get().busy) return false;
  const entry = brandDialog.get().kits.find((kit) => kit.id === id);
  const name = entry?.name || (id === 'project' ? 'this project’s own kit' : id);
  brandDialog.set({ busy: `Choosing ${name}…`, error: '', said: '' });
  try {
    const answer = await forOpenAdaptation(await chooseProjectKit(projectId, id));
    if (!acceptKit(projectId, answer)) throw new Error('The server answered without a kit');
    brandDialog.set({ busy: '', said: `${name} is now this project’s brand.` });
    return true;
  } catch (err) {
    // The project's own kit was noted once and is gone: it is not offered again.
    if (id === 'project' && err.status === 422) forgetOwnKit(projectId);
    brandDialog.set({ busy: '', error: `${name} could not be chosen: ${err.message}` });
    return false;
  }
}

/**
 * Remove a kit from the library.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteKit(id) {
  brandDialog.set({ busy: 'Removing the kit…', error: '', said: '' });
  try {
    await removeKit(id);
    brandDialog.set({ busy: '', said: 'The kit was removed from the library.' });
    await loadKits();
    return true;
  } catch (err) {
    brandDialog.set({ busy: '', error: `The kit could not be removed: ${err.message}` });
    return false;
  }
}
