/**
 * Keys as people name them in a brief — "Enter", "esc", "Ctrl+K", "the down
 * arrow" — read into the key and the held keys of a `press` step. The names
 * given back are those the recorder knows (WEBCLIP.md § Steps). Isomorphic
 * and pure.
 * @module utils/director/web/keys
 */

import { MODIFIERS } from '#utils/web/stepKinds.js';

/** Spoken names of keys, lower case, to the name a `press` step takes. */
const NAMES = {
  ...{ enter: 'Enter', return: 'Enter', tab: 'Tab', escape: 'Escape', esc: 'Escape' },
  ...{ space: 'Space', spacebar: 'Space', backspace: 'Backspace', delete: 'Delete', del: 'Delete' },
  ...{ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
  ...{ home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', insert: 'Insert' },
  ...{ pgup: 'PageUp', pgdn: 'PageDown' },
};

/** Spoken names of the keys that are held. */
const HELD = {
  ...{ ctrl: 'Control', control: 'Control', alt: 'Alt', option: 'Alt', opt: 'Alt' },
  ...{ shift: 'Shift', cmd: 'Meta', command: 'Meta', meta: 'Meta', win: 'Meta', super: 'Meta' },
};

/**
 * One key by its spoken name.
 * @param {string} word
 * @returns {string} The key's name; '' when the word names no key
 */
function keyName(word) {
  const name = word
    .toLowerCase()
    .replace(/^(?:arrow)[\s-]*(up|down|left|right)$/, '$1')
    .replace(/^(up|down|left|right)[\s-]*arrow$/, '$1')
    .replace(/^page[\s-]+(up|down)$/, 'page$1');
  if (NAMES[name]) return NAMES[name];
  if (/^f(?:[1-9]|1[0-2])$/.test(name)) return name.toUpperCase();
  // One character is the key that types it: "a", "?", "/".
  return Array.from(word).length === 1 && word.trim() ? word : '';
}

/**
 * Read a key, alone or with held keys: `Enter`, `ctrl+k`, `Cmd-Shift-P`,
 * `shift tab`.
 * @param {string} text
 * @returns {{ key: string, modifiers: string[] }|null} null when the text
 *   is not a key — it may be the name of a button to press instead
 */
export function readKey(text) {
  const clean = text
    .trim()
    .replace(/^the\s+/i, '')
    .replace(/\s+key$/i, '');
  const whole = keyName(clean);
  if (whole) return { key: whole, modifiers: [] };
  const parts = clean.split(/\s*[+-]\s*|\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const held = parts.slice(0, -1).map((part) => HELD[part.toLowerCase()]);
  const named = keyName(parts[parts.length - 1]);
  if (!named || held.some((name) => !name)) return null;
  // With a key held, a letter is the key itself, not its capital.
  const key = named.length === 1 ? named.toLowerCase() : named;
  return { key, modifiers: MODIFIERS.filter((name) => held.includes(name)) };
}

/**
 * A key as a stop's `text` writes it — and as people read it.
 * @param {{ key: string, modifiers: string[] }} combo
 * @returns {string} `Control+K`
 */
export const keyText = (combo) => [...combo.modifiers, combo.key].join('+');
