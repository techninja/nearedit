/**
 * Presets: named corners of the one synth design. A preset is only a set of
 * parameter values; a part names a preset and may override any parameter on
 * top. Each preset's `level` is trimmed so that all play about equally
 * loud. Isomorphic and pure.
 * @module utils/music/catalog/presets
 */

import { acid, bass, sub } from './presets/bass.js';
import { bell, keys, organ, pluck } from './presets/keys.js';
import { arp, lead } from './presets/leads.js';
import { pad, strings } from './presets/pads.js';

/** @typedef {import('./presets/preset.js').Preset} Preset */

/** Categories, in the order a menu shows them. */
export const PRESET_CATEGORIES = Object.freeze(['bass', 'keys', 'pad', 'lead']);

/**
 * Every preset by name.
 * @type {Readonly<Record<string, Preset>>}
 */
export const PRESETS = Object.freeze({
  bass,
  sub,
  acid,
  pluck,
  keys,
  organ,
  pad,
  strings,
  lead,
  bell,
  arp,
});

/** The preset of a part that names none, or one that does not exist. */
export const DEFAULT_PRESET = 'keys';
