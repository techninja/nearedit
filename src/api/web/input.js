/**
 * Input events as DevTools commands: `[method, params]` pairs the performer
 * sends in order, without waiting — a mouse event is only answered once a
 * frame has been drawn. Pure.
 * @module api/web/input
 */

import { MODIFIER_BITS, charKey, keyEvent, namedKey } from './keys.js';

/** @typedef {[string, object]} Command - A DevTools method and its parameters */

/** `buttons` bits of `Input.dispatchMouseEvent`. */
const BUTTON_BITS = { left: 1, right: 2, middle: 4 };

/**
 * @param {'mouseMoved'|'mousePressed'|'mouseReleased'} type
 * @param {{ x: number, y: number }} at - Viewport CSS pixels
 * @param {{ button?: string, held?: string, count?: number }} [how] - `button`: the one that
 *   changes; `held`: one that stays down while the mouse moves; `count`: 1 for a click, 2 for the
 *   second of a double click
 * @returns {Command}
 */
export function mouse(type, at, { button = 'none', held = '', count = 0 } = {}) {
  const down = type === 'mousePressed' ? button : held;
  const params = {
    ...{ type, x: at.x, y: at.y, button: type === 'mouseMoved' ? held || 'none' : button },
    ...{ buttons: BUTTON_BITS[down] || 0, clickCount: count },
  };
  return ['Input.dispatchMouseEvent', params];
}

/**
 * The key events that type one character.
 * @param {string} char - One character (a whole code point)
 * @returns {Command[]}
 */
export function typeChar(char) {
  const def = charKey(char);
  // Not on the keyboard (é, 中, an emoji): inserted the way an input method would.
  if (!def) return [['Input.insertText', { text: char }]];
  return [
    ['Input.dispatchKeyEvent', keyEvent(def, 'down')],
    ['Input.dispatchKeyEvent', keyEvent(def, 'up')],
  ];
}

/** Select everything in the focused field and delete it. */
export const CLEAR_FIELD = /** @type {Command[]} */ ([
  [
    'Input.dispatchKeyEvent',
    { ...keyEvent(/** @type {any} */ (namedKey('a')), 'down', 2), commands: ['selectAll'] },
  ],
  ['Input.dispatchKeyEvent', keyEvent(/** @type {any} */ (namedKey('a')), 'up', 2)],
  ['Input.dispatchKeyEvent', keyEvent(/** @type {any} */ (namedKey('Backspace')), 'down')],
  ['Input.dispatchKeyEvent', keyEvent(/** @type {any} */ (namedKey('Backspace')), 'up')],
]);

/**
 * One key going down or up, with the keys held meanwhile.
 * @param {string} name - A `press` step's `key`
 * @param {string[]} modifiers - `Alt`, `Control`, `Meta`, `Shift`
 * @param {'down'|'up'} way
 * @returns {Command[]|null} null when there is no such key
 */
export function pressKey(name, modifiers, way) {
  const def = namedKey(name);
  if (!def) return null;
  const held = modifiers.filter((modifier) => MODIFIER_BITS[modifier]);
  let bits = 0;
  /** @type {Command[]} */
  const around = held.map((modifier) => {
    if (way === 'down') bits |= MODIFIER_BITS[modifier];
    const event = keyEvent(/** @type {any} */ (namedKey(modifier)), way, bits);
    return ['Input.dispatchKeyEvent', event];
  });
  const all = held.reduce((sum, modifier) => sum | MODIFIER_BITS[modifier], 0);
  /** @type {Command} */
  const main = ['Input.dispatchKeyEvent', keyEvent(def, way, all)];
  // Down: the held keys first, then the key. Up: the key first.
  return way === 'down' ? [...around, main] : [main, ...around.reverse()];
}
