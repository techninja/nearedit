/**
 * The caption style as an editor shows it: the controls of `CAPTION_STYLE`
 * — generated, like a generator's or an effect's — in the sections the
 * table names, with how many fields of each differ from the preset; and
 * the font families a caption can be set in. Pure and isomorphic.
 * @module utils/captionsUi/styleControls
 */

import { CAPTION_PRESETS } from '#utils/captions/presets.js';
import {
  flatCaptionStyle,
  normalizeCaptionStyle,
  resolveCaptionStyle,
} from '#utils/captions/resolve.js';
import { CAPTION_STYLE, readPath } from '#utils/captions/style.js';
import { FONT_FAMILIES } from '#utils/compose/fonts.js';
import { paramControls } from '#utils/inspector/paramControls.js';

/** @typedef {import('#utils/inspector/paramControls.js').ParamControl} ParamControl */

/** Field paths start with this: `captions.style.highlight.color`. */
export const STYLE_PREFIX = 'captions.style';

/**
 * @typedef {Object} StyleSection
 * @property {string} title - The group of `CAPTION_STYLE`
 * @property {ParamControl[]} controls - Those that apply (a `when` may hide some)
 * @property {number} changed - How many of the section's fields differ from the preset
 */

/**
 * The preset a stored style is built on.
 * @param {unknown} stored - What the document holds (`edl.captions?.style`)
 * @returns {{ name: string, label: string, description: string }}
 */
export function presetOf(stored) {
  const name = resolveCaptionStyle(stored).preset;
  const { label, description } = CAPTION_PRESETS[name];
  return { name, label, description };
}

/**
 * The paths of a stored style that differ from its preset.
 * @param {unknown} stored
 * @returns {string[]}
 */
export function changedPaths(stored) {
  const differing = normalizeCaptionStyle(stored);
  return Object.keys(CAPTION_STYLE).filter(
    (path) => path !== 'preset' && readPath(differing, path) !== undefined,
  );
}

/**
 * The style's controls, section by section, in the table's order. The
 * preset itself is not among them: tiles choose it.
 * @param {unknown} stored
 * @returns {StyleSection[]}
 */
export function styleSections(stored) {
  const controls = paramControls(CAPTION_STYLE, flatCaptionStyle(stored), STYLE_PREFIX);
  const changed = new Set(changedPaths(stored));
  /** @type {StyleSection[]} */
  const sections = [];
  for (const control of controls) {
    if (control.name === 'preset') continue;
    const title = CAPTION_STYLE[control.name].group || 'Other';
    let section = sections.find((entry) => entry.title === title);
    if (!section) sections.push((section = { title, controls: [], changed: 0 }));
    section.controls.push(control);
  }
  // A hidden field that differs still counts: it is part of what "Back to preset" undoes.
  for (const path of changed) {
    const section = sections.find((entry) => entry.title === CAPTION_STYLE[path].group);
    if (section) section.changed++;
  }
  return sections;
}

/**
 * The families a caption can be set in: the bundled ones, then the
 * document's own; and the style's family when it is neither (kept, so a
 * hand-written document is not rewritten by opening its style).
 * @param {any[]|undefined} fonts - The document's font table (`edl.fonts`)
 * @param {string} current - The style's family
 * @returns {{ label: string, families: string[] }[]} Groups for a dropdown
 */
export function fontChoices(fonts, current) {
  const bundled = FONT_FAMILIES.map((family) => family.id);
  const own = [
    ...new Set(
      (Array.isArray(fonts) ? fonts : []).map((face) => String(face?.family || '')).filter(Boolean),
    ),
  ].filter((family) => !bundled.includes(family));
  const groups = [{ label: 'Bundled', families: bundled }];
  if (own.length) groups.push({ label: 'This document', families: own });
  const known = [...bundled, ...own].some(
    (family) => family.toLowerCase() === current.toLowerCase(),
  );
  if (current && !known) groups.push({ label: 'Not installed', families: [current] });
  return groups;
}
