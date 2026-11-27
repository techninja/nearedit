/**
 * Sections for long parameter lists. A generator with dozens of parameters
 * (particles) is not shown as one endless list: its controls are split
 * into sections that open and close. A schema may name the section of a
 * parameter itself (`group: 'Emitter'`); without that hint consecutive
 * parameters are gathered by the families their names form (`size`,
 * `sizeJitter`, `sizeStart` …) and a section is named after what it holds.
 * Short lists stay as they are. Pure and isomorphic.
 * @module utils/inspector/paramSections
 */

import { humanize } from '#utils/keyframes/labels.js';

/** @typedef {import('./paramControls.js').ParamControl} ParamControl */

/**
 * @typedef {Object} ParamSection
 * @property {string} title - '' for a list that needs no heading
 * @property {ParamControl[]} controls
 * @property {number} changed - How many of them are set to something other
 *   than their default
 */

/** Lists up to this long are shown whole. */
export const SECTION_THRESHOLD = 12;
/** A section is not closed before it has this many controls. */
const SECTION_MIN = 6;
/** Families named in a section's title at most. */
const TITLE_NAMES = 3;

/**
 * The first word of a parameter's name, without a number: `emitterWidth` →
 * `emitter`, `color2` → `color`.
 * @param {string} name
 * @returns {string}
 */
export function paramStem(name) {
  return String(name).replace(/([a-z])[A-Z0-9].*$/, '$1');
}

/**
 * Whether two parameters belong to one family: the same first word, give
 * or take a plural (`colors` and `color1`).
 * @param {string} a - Parameter name
 * @param {string} b
 * @returns {boolean}
 */
export function sameFamily(a, b) {
  const [x, y] = [paramStem(a), paramStem(b)];
  return x === y || `${x}s` === y || `${y}s` === x;
}

/**
 * @param {ParamControl[]} controls
 * @param {Record<string, any>} stored
 * @param {string} title
 * @returns {ParamSection}
 */
function section(controls, stored, title) {
  const changed = controls.filter((control) => Object.hasOwn(stored, control.name)).length;
  return { title, controls, changed };
}

/**
 * A title from the families a section holds: "Size · Rotation · Spin …".
 * @param {ParamControl[]} controls
 * @returns {string}
 */
function titleOf(controls) {
  /** @type {string[]} */
  const stems = [];
  for (const { name } of controls) {
    if (!stems.some((stem) => sameFamily(stem, name))) stems.push(paramStem(name));
  }
  const names = stems.slice(0, TITLE_NAMES).map(humanize).join(' · ');
  return stems.length > TITLE_NAMES ? `${names} …` : names;
}

/**
 * Split a list of controls into sections.
 * @param {ParamControl[]} controls - In schema order
 * @param {Record<string, any>} [stored] - The parameters the clip stores
 *   (what differs from the defaults)
 * @param {Record<string, { group?: string }>} [schema] - For `group` hints
 * @returns {ParamSection[]} One untitled section for a short list
 */
export function paramSections(controls, stored = {}, schema = {}) {
  const hinted = controls.some((control) => schema[control.name]?.group);
  if (!hinted && controls.length <= SECTION_THRESHOLD) return [section(controls, stored, '')];
  /** @type {{ title: string, controls: ParamControl[] }[]} */
  const parts = [];
  for (const control of controls) {
    const last = parts[parts.length - 1];
    const previous = last?.controls[last.controls.length - 1];
    const group = schema[control.name]?.group || '';
    const full =
      last && last.controls.length >= SECTION_MIN && !sameFamily(previous.name, control.name);
    const open = hinted ? !last || last.title !== group : !last || full;
    if (open) parts.push({ title: group, controls: [control] });
    else last.controls.push(control);
  }
  return parts.map((part) => section(part.controls, stored, part.title || titleOf(part.controls)));
}
