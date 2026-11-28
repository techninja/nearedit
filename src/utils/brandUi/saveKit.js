/**
 * Saving a customisation from the Brand dialog: as the project's own kit
 * (it extends the kit it was made from and is chosen at once), or as a kit
 * of the library other projects can choose. The logo and font files that
 * were waiting go to the server with it; a kit that does not validate is
 * not stored and its problems are shown.
 * @module utils/brandUi/saveKit
 */

import { mediaFileUrl } from '#utils/playback/mediaUrl.js';
import { brandDialog } from './dialogState.js';
import { draftKit } from './draft.js';
import { filesOf, slugOf, withStoredNames } from './draftNames.js';
import { fileUrlOf, pendingFiles } from './draftFiles.js';
import { beginDraft, draftSaved, draftState } from './draftState.js';
import { readKit, uploadKitFile, writeKit, writeProjectKit } from './kitApi.js';
import { loadKits } from './kitList.js';
import { acceptKit, kitState } from './kitState.js';

/** @typedef {import('./draft.js').Draft} Draft */

/**
 * Send files of a draft to a kit.
 * @param {{ kitId?: string, projectId?: string }} owner
 * @param {Draft} draft
 * @param {boolean} all - Also the files that are saved with the project
 *   already (a kit of the library needs its own copies)
 * @returns {Promise<Map<string, string>>} Name in the draft → name it was stored under
 */
async function sendFiles(owner, draft, all) {
  const waiting = pendingFiles();
  /** @type {Map<string, string>} */
  const stored = new Map();
  for (const name of filesOf(draft)) {
    let bytes = waiting.get(name);
    if (!bytes && all) {
      const path = fileUrlOf(name);
      const res = path ? await fetch(mediaFileUrl(path)) : null;
      if (res?.ok) bytes = await res.blob();
    }
    if (bytes) stored.set(name, (await uploadKitFile(owner, name, bytes)).name);
  }
  return stored;
}

/**
 * Run a save and say how it went.
 * @param {string} doing - Shown while it runs
 * @param {() => Promise<string>} work - Resolves to what to say when done
 * @returns {Promise<boolean>}
 */
async function saving(doing, work) {
  if (brandDialog.get().busy) return false;
  brandDialog.set({ busy: doing, error: '', said: '', problems: [] });
  try {
    brandDialog.set({ busy: '', said: await work() });
    return true;
  } catch (err) {
    const problems = Array.isArray(err.body?.problems) ? err.body.problems : [];
    brandDialog.set({ busy: '', error: err.message, problems });
    return false;
  }
}

/**
 * Save the draft as the project's own kit and use it.
 * @returns {Promise<boolean>} true when it is now the project's kit
 */
export function saveForProject() {
  const { projectId } = kitState.get();
  const { draft, base } = draftState.get();
  if (!draft || !projectId) return Promise.resolve(false);
  return saving('Saving the brand…', async () => {
    const named = withStoredNames(draft, await sendFiles({ projectId }, draft, false));
    const kit = draftKit(named, named.name || `${base.name}, customised`);
    const answer = await writeProjectKit(projectId, kit);
    if (!acceptKit(projectId, answer)) throw new Error('The server answered without a kit');
    draftSaved(named);
    await beginDraft();
    return 'Saved. This project now has a brand of its own.';
  });
}

/**
 * Save the draft as a kit of the library.
 * @param {string} name - What the kit is called
 * @returns {Promise<boolean>}
 */
export function saveToLibrary(name) {
  const { draft } = draftState.get();
  const id = slugOf(name);
  if (!draft) return Promise.resolve(false);
  if (!id) {
    brandDialog.set({ error: 'Give the kit a name with a letter or a digit in it', problems: [] });
    return Promise.resolve(false);
  }
  return saving(`Saving “${name}” to the library…`, async () => {
    // The kit first: its folder is where its files go. They arrive right after.
    await writeKit(id, draftKit(draft, name));
    const stored = await sendFiles({ kitId: id }, draft, true);
    const renamed = [...stored].some(([from, to]) => from !== to);
    if (renamed) await writeKit(id, draftKit(withStoredNames(draft, stored), name));
    const { problems } = await readKit(id);
    await loadKits();
    brandDialog.set({ problems: (problems || []).filter((problem) => problem.level === 'error') });
    return `Saved to the library as “${name}”. Other projects can choose it; this project keeps the kit it has.`;
  });
}
