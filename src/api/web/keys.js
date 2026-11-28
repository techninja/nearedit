/**
 * Keys as the DevTools protocol wants them: for a `press` step ("Enter",
 * "ArrowDown", "a") and for every character a `type` step types. A US
 * keyboard is assumed for key codes; characters that are not on it are
 * inserted as text, which every input accepts. Pure.
 * @module api/web/keys
 */

/**
 * @typedef {Object} KeyDef
 * @property {string} key - `KeyboardEvent.key`
 * @property {string} code - `KeyboardEvent.code`
 * @property {number} keyCode - The legacy virtual key code
 * @property {string} [text] - What the key types; absent for keys that type nothing
 * @property {boolean} [shift] - The character needs Shift on a US keyboard
 */

/** `Input.dispatchKeyEvent` `modifiers` bits. */
export const MODIFIER_BITS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

/** @type {Record<string, [string, number, string?]>} Named keys: code, key code, text. */
const NAMED = {
  Enter: ['Enter', 13, '\r'],
  Tab: ['Tab', 9],
  Escape: ['Escape', 27],
  Backspace: ['Backspace', 8],
  Delete: ['Delete', 46],
  Insert: ['Insert', 45],
  ArrowLeft: ['ArrowLeft', 37],
  ArrowUp: ['ArrowUp', 38],
  ArrowRight: ['ArrowRight', 39],
  ArrowDown: ['ArrowDown', 40],
  Home: ['Home', 36],
  End: ['End', 35],
  PageUp: ['PageUp', 33],
  PageDown: ['PageDown', 34],
  Alt: ['AltLeft', 18],
  Control: ['ControlLeft', 17],
  Meta: ['MetaLeft', 91],
  Shift: ['ShiftLeft', 16],
  CapsLock: ['CapsLock', 20],
};
const ALIASES = { Esc: 'Escape', Return: 'Enter', Space: ' ', Spacebar: ' ', Del: 'Delete' };
ALIASES.Up = 'ArrowUp';
ALIASES.Down = 'ArrowDown';
ALIASES.Left = 'ArrowLeft';
ALIASES.Right = 'ArrowRight';
ALIASES.Ctrl = 'Control';
ALIASES.Cmd = 'Meta';
ALIASES.Command = 'Meta';
ALIASES.Option = 'Alt';

/** Punctuation of a US keyboard: plain character, shifted character, code, key code. */
const PUNCTUATION = [
  ...['-_Minus189', '=+Equal187', '[{BracketLeft219', ']}BracketRight221', '\\|Backslash220'],
  ...[';:Semicolon186', '\'"Quote222', ',<Comma188', '.>Period190', '/?Slash191', '`~Backquote192'],
];
const SHIFTED_DIGITS = ')!@#$%^&*(';

/**
 * The key that types a character on a US keyboard.
 * @param {string} char - One character
 * @returns {KeyDef|null} null for a character no key types: insert it as text
 */
export function charKey(char) {
  if (char === ' ') return { key: ' ', code: 'Space', keyCode: 32, text: ' ' };
  if (char === '\n' || char === '\r')
    return { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' };
  if (char === '\t') return { key: 'Tab', code: 'Tab', keyCode: 9 };
  if (/^[a-z]$/i.test(char)) {
    const upper = char.toUpperCase();
    const shift = char === upper;
    return { key: char, code: `Key${upper}`, keyCode: upper.charCodeAt(0), text: char, shift };
  }
  if (/^\d$/.test(char))
    return { key: char, code: `Digit${char}`, keyCode: 48 + Number(char), text: char };
  const digit = SHIFTED_DIGITS.indexOf(char);
  if (digit >= 0 && char.length === 1)
    return { key: char, code: `Digit${digit}`, keyCode: 48 + digit, text: char, shift: true };
  const entry = PUNCTUATION.find((row) => row[0] === char || row[1] === char);
  if (!entry || char.length !== 1) return null;
  const [, code, keyCode] = /** @type {RegExpExecArray} */ (/^..(\D+)(\d+)$/.exec(entry));
  return { key: char, code, keyCode: Number(keyCode), text: char, shift: entry[1] === char };
}

/**
 * The key a `press` step names.
 * @param {string} name - "Enter", "ArrowDown", "F5", "a", "?"…
 * @returns {KeyDef|null} null when there is no such key
 */
export function namedKey(name) {
  const wanted = ALIASES[name] || name;
  const exact = Object.keys(NAMED).find((key) => key.toLowerCase() === wanted.toLowerCase());
  if (exact) {
    const [code, keyCode, text] = NAMED[exact];
    return { key: exact, code, keyCode, ...(text && { text }) };
  }
  const fn = /^F(\d{1,2})$/i.exec(wanted);
  if (fn && Number(fn[1]) >= 1 && Number(fn[1]) <= 12)
    return { key: `F${Number(fn[1])}`, code: `F${Number(fn[1])}`, keyCode: 111 + Number(fn[1]) };
  return Array.from(wanted).length === 1 ? charKey(wanted) : null;
}

/**
 * Parameters of `Input.dispatchKeyEvent` for one key going down or up.
 * @param {KeyDef} def
 * @param {'down'|'up'} way
 * @param {number} [modifiers] - `MODIFIER_BITS` of the keys held
 * @returns {object}
 */
export function keyEvent(def, way, modifiers = 0) {
  // Held with Control, Alt or Meta a key is a shortcut: it types nothing.
  const types = def.text !== undefined && !(modifiers & 7);
  return {
    type: way === 'up' ? 'keyUp' : types ? 'keyDown' : 'rawKeyDown',
    ...{ key: def.key, code: def.code, windowsVirtualKeyCode: def.keyCode },
    modifiers: modifiers | (def.shift ? MODIFIER_BITS.Shift : 0),
    ...(types && way === 'down' && { text: def.text, unmodifiedText: def.text }),
  };
}
