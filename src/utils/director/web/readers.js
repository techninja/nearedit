/**
 * How one instruction of a brief is read: a list of readers, tried in
 * order, each understanding one kind of sentence in its many wordings —
 * "click Pricing", "tap on the Pricing link", "press Enter", "type hello
 * into Email", "fill Email with hello", "zoom in on the chart". A reader
 * answers with a stop, or null when the sentence is not its kind. They are
 * generous with wording and strict about meaning: `press` is a key only
 * when what follows is one, `go to` an address only when it looks like one.
 * Isomorphic and pure.
 * @module utils/director/web/readers
 */

import { keyText, readKey } from './keys.js';
import { leadingQuote, unquote } from './words.js';

/** @typedef {{ do: string, on?: string, text?: string }} Read */
/** @typedef {(line: string) => Read|null} Reader */

const THE = '(?:the\\s+|an?\\s+)?';
const ADDRESS =
  /^(?:https?:\/\/\S+|\/\S*|\.{1,2}\/\S*|[?#]\S+|(?:[\w-]+\.)+[a-z]{2,}(?:[/?#]\S*)?)$/i;
const SECONDS = /^(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?)?$/i;
const SPOKEN = { 'half a second': 0.5, 'a second': 1, 'a moment': 1, 'a beat': 1, 'a bit': 1 };

/**
 * A reader for sentences of the shape `<verb> [the] <name>`.
 * @param {string} verb - The step kind
 * @param {string} phrases - Alternatives of a regular expression: the wordings
 * @param {Partial<Read>} [extra]
 * @returns {Reader}
 */
function named(verb, phrases, extra = {}) {
  const shape = new RegExp(`^(?:${phrases})\\s+${THE}(\\S.*)$`, 'i');
  return (line) => {
    const on = shape.exec(line)?.[1];
    return on ? { do: verb, on: unquote(on), ...extra } : null;
  };
}

/** @type {Reader} `wait 2`, `pause for half a second`, `hold 1.5s` */
const wait = (line) => {
  const found = /^(?:wait|pause|hold|rest)(?:\s+for)?(?:\s+about)?(?:\s+(.+))?$/i.exec(line);
  if (!found) return null;
  const amount = (found[1] || '').trim().toLowerCase();
  if (!amount) return { do: 'wait' };
  const number = SECONDS.exec(amount);
  if (number) {
    const seconds = Number(number[1]) / (/^m/i.test(number[2] || '') ? 1000 : 1);
    return { do: 'wait', text: String(seconds) };
  }
  return SPOKEN[amount] ? { do: 'wait', text: String(SPOKEN[amount]) } : null;
};

/** @type {Reader} `press Enter`, `hit Ctrl+K`, `press the Tab key` */
const press = (line) => {
  const found = /^(?:press|hit|tap|push|strike)\s+(.+)$/i.exec(line);
  const combo = found && readKey(found[1]);
  return combo ? { do: 'press', text: keyText(combo) } : null;
};

/** @type {Reader} `go to /pricing`, `open https://…`, `visit example.com/docs` */
const goto = (line) => {
  const shape =
    /^(?:go\s*to|open|visit|navigate\s+to|browse\s+to|load)\s+(?:the\s+)?(?:page\s+|address\s+|url\s+)?(\S+)$/i;
  const address = unquote(shape.exec(line)?.[1] || '');
  if (!ADDRESS.test(address)) return null;
  const bare = /^[\w-]+\./.test(address) && !/^https?:/i.test(address);
  return { do: 'goto', text: bare ? `https://${address}` : address };
};

/** @type {Reader} `type hello into Email`, `enter "a b" in the Name field`, `fill Email with hello` */
const type = (line) => {
  const filled = new RegExp(`^fill(?:\\s+in|\\s+out)?\\s+${THE}(.+?)\\s+with\\s+(.+)$`, 'i').exec(
    line,
  );
  if (filled) return { do: 'type', on: unquote(filled[1]), text: unquote(filled[2]) };
  const found = /^(?:type|enter|write|input|key\s+in)(?:\s+in)?\s+(.+)$/i.exec(line);
  if (!found) return null;
  const where = new RegExp(`^(?:into|in\\s+to|inside|in|on)\\s+${THE}(.+)$`, 'i');
  const quoted = leadingQuote(found[1]);
  if (quoted) {
    const on = where.exec(quoted.rest)?.[1];
    if (quoted.rest && !on) return null;
    return { do: 'type', text: quoted.inner, ...(on && { on: unquote(on) }) };
  }
  const split = new RegExp(`^(.+)\\s+(?:into|in\\s+to|inside)\\s+${THE}(.+)$`, 'i').exec(found[1]);
  const loose = split || new RegExp(`^(.+)\\s+in\\s+${THE}(.+)$`, 'i').exec(found[1]);
  if (!loose) return { do: 'type', text: found[1].trim() };
  return { do: 'type', text: loose[1].trim(), on: unquote(loose[2]) };
};

/** @type {Reader} `select Pro from Plan`, `choose "2 to 10" in the Team size menu`, `set Plan to Pro` */
const select = (line) => {
  const set = new RegExp(`^set\\s+${THE}(.+?)\\s+to\\s+(.+)$`, 'i').exec(line);
  if (set) return { do: 'select', on: unquote(set[1]), text: unquote(set[2]) };
  const found = /^(?:select|choose|pick)\s+(?:the\s+)?(?:option\s+)?(.+)$/i.exec(line);
  if (!found) return null;
  const from = new RegExp(`^(?:from|in|on|under)\\s+${THE}(.+)$`, 'i');
  const quoted = leadingQuote(found[1]);
  const split = quoted
    ? [null, quoted.inner, from.exec(quoted.rest)?.[1]]
    : new RegExp(`^(.+?)\\s+(?:from|in|under)\\s+${THE}(.+)$`, 'i').exec(found[1]);
  return split?.[2] ? { do: 'select', on: unquote(split[2]), text: unquote(split[1]) } : null;
};

/** @type {Reader} `scroll down`, `scroll to the top`, `scroll down to Pricing`, `scroll down 400` */
const scroll = (line) => {
  const found = /^scroll(?:\s+back)?(?:\s+(down|up))?(?:\s+(?:to|till|until))?(?:\s+(.+))?$/i.exec(
    line,
  );
  if (!found) return null;
  const way = (found[1] || 'down').toLowerCase();
  const rest = (found[2] || '').replace(/^the\s+/i, '').trim();
  const pixels = /^(\d+)\s*(?:px|pixels?)?$/i.exec(rest);
  if (pixels) return { do: 'scroll', on: way, text: pixels[1] };
  if (!rest || /^(?:a\s+)?(?:bit|little|screen|page|more|further)$/i.test(rest))
    return { do: 'scroll', on: way };
  const end = /^(top|bottom|start|beginning|end)(?:\s+of\s+the\s+page)?$/i.exec(rest)?.[1];
  if (end) return { do: 'scroll', on: /^(top|start|beginning)$/i.test(end) ? 'top' : 'bottom' };
  return { do: 'scroll', on: unquote(rest) };
};

/** @type {Reader[]} In the order they are tried: the strictest meanings first. */
export const READERS = [
  wait,
  press,
  goto,
  type,
  select,
  scroll,
  named(
    'focus',
    'zoom(?:\\s+in)?(?:\\s+(?:on|into|in\\s+on|to|in\\s+to))?|focus(?:\\s+on)?|close[- ]?up\\s+(?:on|of)|move\\s+in\\s+on',
  ),
  named('highlight', 'spotlight|put\\s+a\\s+spotlight\\s+on', { text: 'spotlight' }),
  named('highlight', 'highlight|outline|circle|mark|point\\s+out|call\\s+out|emphasi[sz]e'),
  named(
    'hover',
    'hover(?:\\s+(?:over|on))?|mouse\\s+over|point\\s+(?:at|to)|rest\\s+on|move(?:\\s+the)?(?:\\s+(?:mouse|cursor|pointer))?\\s+(?:to|over|onto)',
  ),
  named(
    'scroll',
    '(?:go|jump|skip|move|head)(?:\\s+(?:back|down|up))?\\s+to|(?:back|return)\\s+to|show(?:\\s+(?:me|us))?|look\\s+at|see|reveal',
  ),
  named(
    'click',
    '(?:double[- ]?|right[- ]?)?click(?:\\s+on)?|tap(?:\\s+on)?|press|push|hit|open|toggle|switch\\s+to|check|uncheck|tick|select|choose|pick|activate|submit',
  ),
];
