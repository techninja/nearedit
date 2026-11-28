/**
 * What a part and a song are called when nobody named them.
 * Isomorphic and pure.
 * @module utils/music/label
 */

import { DEFAULT_KIT, KITS } from './catalog/kits.js';
import { PRESETS } from './catalog/presets.js';
import { presetName } from './params.js';

/**
 * @param {any} part - A part of a song
 * @returns {string} Its name; else `808 drums` for a drum part, the
 *   preset's label for a synth part
 */
export function partLabel(part) {
  if (typeof part?.name === 'string' && part.name.trim()) return part.name.trim();
  if (part?.kind === 'drums') {
    const kit = Object.hasOwn(KITS, part.kit) ? KITS[part.kit] : KITS[DEFAULT_KIT];
    return `${kit.label} drums`;
  }
  return PRESETS[presetName(part?.preset)].label;
}

/**
 * A short name for a song, from its parts: `808 drums, Bass, Pad`.
 * @param {any} song
 * @param {number} [most=40] - Longest label, characters
 * @returns {string} `Music` for a song without parts
 */
export function songLabel(song, most = 40) {
  const parts = Array.isArray(song?.parts) ? song.parts : [];
  const names = [...new Set(parts.map(partLabel))];
  if (!names.length) return 'Music';
  let label = names[0];
  for (const name of names.slice(1)) {
    if (`${label}, ${name}`.length > most) return `${label}…`.slice(0, most);
    label = `${label}, ${name}`;
  }
  return label.slice(0, most);
}
