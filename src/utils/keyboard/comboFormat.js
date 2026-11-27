/**
 * Showing a key combination to people: `Ctrl+Shift+Z`, or `⇧⌘Z` on macOS.
 * Pure.
 * @module utils/keyboard/comboFormat
 */

/** Canonical key → how it is shown. */
const DISPLAY = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Insert: 'Ins',
};
const MAC_MODIFIERS = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' };

/**
 * @param {string} key - Canonical key name
 * @param {boolean} mac
 * @returns {string}
 */
function keyLabel(key, mac) {
  const pad = /^Num(\d)$/.exec(key);
  if (pad) return `Num ${pad[1]}`;
  return DISPLAY[key] || (key === 'Delete' && mac ? 'Del' : key);
}

/**
 * A combo for people to read.
 * @param {string} combo - Canonical combo
 * @param {boolean} [mac=false]
 * @returns {string}
 */
export function formatCombo(combo, mac = false) {
  if (!combo) return '';
  // The last "+" separates the key — unless the key itself is "+".
  const cut = combo === '+' || combo.endsWith('++') ? combo.length - 1 : combo.lastIndexOf('+') + 1;
  const modifiers = cut > 0 ? combo.slice(0, cut - 1).split('+') : [];
  const shown = keyLabel(combo.slice(cut), mac);
  if (mac) return `${modifiers.map((mod) => MAC_MODIFIERS[mod] || mod).join('')}${shown}`;
  return [...modifiers, shown].join('+');
}
