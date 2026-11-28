/**
 * What the Brand dialog does while a kit is being customised: a field of
 * the token editor changed, a token goes back to its kit, a logo or a font
 * file was chosen, and "Save for this project".
 * @module utils/brandUi/dialogDraftEvents
 */

import { TOKEN_SCHEMA } from '#utils/brand/index.js';
import { changeToken, chooseFile, resetOne } from './draftEdits.js';
import { saveForProject } from './saveKit.js';

/** @typedef {import('./dialogEvents.js').BrandDialogHost & HTMLElement} Host */

/** A field of the token editor changed. @param {Host} _host @param {CustomEvent} event */
export function handleToken(_host, event) {
  const { name, value, phase } = event.detail;
  event.stopPropagation();
  if (phase === 'cancel') return;
  const [group, token, field] = String(name).split('.');
  const spec = TOKEN_SCHEMA[group]?.[token];
  if (!spec) return;
  const numeric = spec.type === 'number' || (spec.type === 'font' && typeof value === 'number');
  changeToken(name, numeric && !field ? Number(value) : value);
}

/** @param {Host} _host @param {CustomEvent} event */
export function handleReset(_host, event) {
  event.stopPropagation();
  resetOne(event.detail.path);
}

/** @param {Host} _host @param {CustomEvent} event */
export function handleFile(_host, event) {
  event.stopPropagation();
  chooseFile(event.detail.path, event.detail.file);
}

/** "Save for this project". */
export function handleSave() {
  saveForProject();
}
