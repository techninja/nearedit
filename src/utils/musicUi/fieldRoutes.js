/**
 * From the name a control reports to the change it means. The music
 * editor's controls all report `field-change` with a name: a field of the
 * song (`bpm`, `master.volume`), a field of a part (`part.<id>.volume`,
 * `part.<id>.kit`, `part.<id>.params.cutoff`), or — from the grid and the
 * sound panel, which only ever show one part — a part's field without its
 * id (`steps`, `preset`, `params.cutoff`). Pure.
 * @module utils/musicUi/fieldRoutes
 */

import { setKit, setSteps } from './drumEdit.js';
import { withPartField } from './partEdit.js';
import { SONG_FIELDS, changePart, setSongField } from './songEdit.js';
import { resetParams, setParam, setPreset } from './soundEdit.js';

/** @typedef {import('#utils/music/types.js').Song} Song */

const PART_NAME = /^part\.([\w-]+)\.(.+)$/;

/**
 * @param {string} name - As a control reports it
 * @param {string} shown - Id of the part whose grid and sound are showing
 * @returns {{ partId: string, field: string }} `partId` is '' for a field of the song
 */
export function fieldTarget(name, shown) {
  if (Object.hasOwn(SONG_FIELDS, name)) return { partId: '', field: name };
  const named = PART_NAME.exec(name);
  return named ? { partId: named[1], field: named[2] } : { partId: shown, field: name };
}

/**
 * A part with one of its fields set, whatever kind of field it is.
 * @param {Song} song
 * @param {any} part
 * @param {string} field
 * @param {any} value
 * @returns {any} The same part for a field it does not have
 */
export function withField(song, part, field, value) {
  if (field === 'kit') return part.kind === 'drums' ? setKit(part, value) : part;
  if (field === 'steps') return part.kind === 'drums' ? setSteps(part, Number(value)) : part;
  if (part.kind !== 'synth') return withPartField(song, part, field, value);
  if (field === 'preset') return setPreset(part, value);
  if (field === 'params') return resetParams(part);
  if (field.startsWith('params.')) return setParam(part, field.slice(7), value);
  return withPartField(song, part, field, value);
}

/**
 * Set a field of a song by the name a control reports.
 * @param {Song} song
 * @param {string} name
 * @param {any} value
 * @param {string} [shown] - Id of the part that is showing
 * @returns {Song} The same song when the name means nothing or changes nothing
 */
export function setField(song, name, value, shown = '') {
  const { partId, field } = fieldTarget(name, shown);
  if (!partId) return setSongField(song, field, value);
  return changePart(song, partId, (part) => withField(song, part, field, value));
}
