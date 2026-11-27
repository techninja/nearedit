/**
 * Where a JSON text goes wrong. `JSON.parse` says what it did not expect but
 * not always where; someone fixing a hand-written document needs the line.
 * A small strict scanner finds the first character that cannot be there.
 * Pure.
 * @module bin/lib/jsonError
 */

const SPACE = /[ \t\r\n]/;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const STRING = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;

/**
 * Offset of the first error in a JSON text.
 * @param {string} text
 * @returns {number} -1 when the text is valid JSON
 */
export function jsonErrorOffset(text) {
  let at = 0;
  const skip = () => {
    while (at < text.length && SPACE.test(text[at])) at++;
  };
  const fail = () => {
    throw at;
  };
  const token = (pattern) => {
    pattern.lastIndex = at;
    const match = pattern.exec(text);
    if (!match) fail();
    at += match[0].length;
  };
  const value = () => {
    skip();
    const ch = text[at];
    if (ch === '{' || ch === '[') {
      const close = ch === '{' ? '}' : ']';
      at++;
      skip();
      if (text[at] === close) return void at++;
      for (;;) {
        if (ch === '{') {
          skip();
          token(STRING);
          skip();
          if (text[at++] !== ':') (at--, fail());
        }
        value();
        skip();
        if (text[at] === close) return void at++;
        if (text[at++] !== ',') (at--, fail());
        skip();
        // A comma must be followed by another entry.
        if (text[at] === close) fail();
      }
    }
    if (ch === '"') return token(STRING);
    for (const word of ['true', 'false', 'null']) {
      if (text.startsWith(word, at)) return void (at += word.length);
    }
    return token(NUMBER);
  };
  try {
    value();
    skip();
    if (at < text.length) fail();
    return -1;
  } catch (offset) {
    if (typeof offset !== 'number') throw offset;
    return offset;
  }
}

/**
 * "line 3, column 1" for an offset into a text.
 * @param {string} text
 * @param {number} offset
 * @returns {string}
 */
export function lineAndColumn(text, offset) {
  const before = text.slice(0, offset).split('\n');
  return `line ${before.length}, column ${before[before.length - 1].length + 1}`;
}
