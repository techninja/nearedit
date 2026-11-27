/**
 * Key combinations as text. A combo is written `Mod+Shift+Z`: modifiers
 * (`Ctrl`, `Alt`, `Shift`, `Meta`, and `Mod` = Ctrl, or Cmd on macOS) then
 * one key — a character, or a `KeyboardEvent.key` name such as `ArrowLeft`,
 * `Delete`, `Space`. Pure.
 * @module utils/keyboard/combo
 */

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];

/** Spellings people use → canonical modifier. */
const MODIFIER_NAMES = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  opt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  win: 'Meta',
};

/** Spellings people use → `KeyboardEvent.key` name. */
const KEY_NAMES = {
  ' ': 'Space',
  space: 'Space',
  spacebar: 'Space',
  esc: 'Escape',
  escape: 'Escape',
  del: 'Delete',
  delete: 'Delete',
  backspace: 'Backspace',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  plus: '+',
  minus: '-',
};

/**
 * Put a key and its modifiers into canonical form. Shift is dropped for
 * symbols: `?` already says Shift was down, and which key carries a symbol
 * depends on the keyboard layout.
 * @param {string} key
 * @param {Set<string>} modifiers
 * @returns {string}
 */
function canonical(key, modifiers) {
  const name = KEY_NAMES[key.toLowerCase()] || (key.length === 1 ? key.toUpperCase() : key);
  const symbol = name.length === 1 && name.toLowerCase() === name.toUpperCase();
  const kept = MODIFIER_ORDER.filter((mod) => modifiers.has(mod) && !(symbol && mod === 'Shift'));
  return [...kept, name].join('+');
}

/**
 * Split a written combo into its key and modifier words. The last "+"
 * separates the key — unless the key itself is "+" (`+`, `Ctrl++`).
 * @param {string} text
 * @returns {{ key: string, modifiers: string[] }}
 */
function splitCombo(text) {
  if (text === '+') return { key: '+', modifiers: [] };
  if (text.endsWith('++')) return { key: '+', modifiers: text.slice(0, -2).split('+') };
  const cut = text.lastIndexOf('+');
  if (cut < 0) return { key: text, modifiers: [] };
  return { key: text.slice(cut + 1), modifiers: text.slice(0, cut).split('+') };
}

/**
 * Normalise a written combo (`"ctrl+shift+z"`, `"Mod+Z"`, `"+"`).
 * @param {string} text
 * @param {boolean} [mac=false] - Resolve `Mod` to Cmd instead of Ctrl
 * @returns {string} Canonical combo, or '' when the text names no key
 */
export function normalizeCombo(text, mac = false) {
  const raw = String(text ?? '');
  const { key, modifiers } = splitCombo(raw === ' ' ? raw : raw.trim());
  const held = new Set();
  for (const part of modifiers) {
    const word = part.trim().toLowerCase();
    const name = word === 'mod' ? (mac ? 'Meta' : 'Ctrl') : MODIFIER_NAMES[word];
    if (!name) return '';
    held.add(name);
  }
  const named = key === ' ' ? key : key.trim();
  return named ? canonical(named, held) : '';
}

/**
 * The canonical combo of a keyboard event.
 * @param {{ key: string, code?: string, ctrlKey?: boolean, altKey?: boolean,
 *   shiftKey?: boolean, metaKey?: boolean }} event
 * @returns {string} '' for a bare modifier press
 */
export function eventCombo(event) {
  let key = event.key || '';
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'Dead', 'Unidentified'].includes(key)) {
    return '';
  }
  // Option+letter types a symbol on macOS; the physical key says which letter.
  const physical = /^(?:Key|Digit)(.)$/.exec(event.code || '');
  if (event.altKey && physical) key = physical[1];
  const modifiers = new Set();
  if (event.ctrlKey) modifiers.add('Ctrl');
  if (event.altKey) modifiers.add('Alt');
  if (event.shiftKey) modifiers.add('Shift');
  if (event.metaKey) modifiers.add('Meta');
  return key ? canonical(key, modifiers) : '';
}

/** Canonical key → how it is shown. */
const DISPLAY = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc' };
const MAC_MODIFIERS = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' };

/**
 * A combo for people to read: `Ctrl+Shift+Z`, or `⇧⌘Z` on macOS.
 * @param {string} combo - Canonical combo
 * @param {boolean} [mac=false]
 * @returns {string}
 */
export function formatCombo(combo, mac = false) {
  if (!combo) return '';
  const { key, modifiers } = splitCombo(combo);
  const shown = DISPLAY[key] || (key === 'Delete' && mac ? 'Del' : key);
  if (mac) return `${modifiers.map((mod) => MAC_MODIFIERS[mod] || mod).join('')}${shown}`;
  return [...modifiers, shown].join('+');
}
