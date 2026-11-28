/**
 * What a person does to a customisation in the Brand dialog: change a
 * token, let one follow its kit again, name the kit, bring a logo or a
 * font file.
 * @module utils/brandUi/draftEdits
 */

import { resetToken, setToken, withFont } from './draft.js';
import { holdFile } from './draftFiles.js';
import { draftState, showDraft } from './draftState.js';
import { faceFromFile, fileProblem } from './fontFiles.js';

/**
 * Change a token of the draft.
 * @param {string} path - `color.primary`, `font.heading.weight`…
 * @param {any} value - '' for a derived colour: work it out again
 */
export function changeToken(path, value) {
  const { draft, base } = draftState.get();
  if (draft) showDraft(setToken(draft, path, value, base), { dirty: true });
}

/** A token follows the kit the draft builds on again. @param {string} path */
export function resetOne(path) {
  const { draft } = draftState.get();
  if (draft) showDraft(resetToken(draft, path), { dirty: true });
}

/** @param {string} name - What the kit is called */
export function renameDraft(name) {
  const { draft } = draftState.get();
  if (draft) showDraft({ ...draft, name }, { dirty: true });
}

/**
 * A logo or a font file was chosen for a token. A font file becomes a
 * family of its own (named after the file) and the token is set in it. A
 * logo is the mark as well, until the customisation is given a mark of its
 * own: the mark is what the corner bug, the intro, the outro and the
 * stinger show.
 * @param {string} path - `logo.main`, `logo.mark`, `font.heading` or `font.body`
 * @param {{ name: string, size: number } & Blob} file
 * @returns {boolean} false when the file cannot be used (`problem` says why)
 */
export function chooseFile(path, file) {
  const { draft, base } = draftState.get();
  if (!draft) return false;
  const font = path.startsWith('font.');
  const problem = fileProblem(file.name, font ? 'font' : 'logo', file.size);
  if (problem) {
    draftState.set({ problem });
    return false;
  }
  holdFile(file.name, file);
  if (!font) {
    let next = setToken(draft, path, file.name, base);
    // The elements show the mark. A logo is the mark too — unless the
    // customisation was given a mark of its own, another picture.
    const logo = draft.tokens.logo || {};
    const follows = path === 'logo.main' && (!logo.mark || logo.mark === logo.main);
    if (follows) next = setToken(next, 'logo.mark', file.name, base);
    showDraft(next, { dirty: true });
    return true;
  }
  const face = faceFromFile(file.name);
  let next = withFont(draft, face);
  next = setToken(next, `${path}.family`, face.family, base);
  next = setToken(next, `${path}.weight`, face.weight, base);
  next = setToken(next, `${path}.italic`, face.style === 'italic', base);
  showDraft(next, { dirty: true });
  return true;
}
