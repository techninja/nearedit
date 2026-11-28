/**
 * The fields of a layer and of a group, and reading them out of whatever a
 * kit file or a clip holds. A field keeps a value of its kind **or a
 * reference** (`{color.primary}`, `{slot.name}`) that stands for one;
 * everything else is dropped. Only own properties of plain objects are
 * read, every text is cut to its limit. Isomorphic and pure.
 * @module utils/brand/element/fields
 */

import { isHex } from '#utils/compose/color.js';
import { BLEND_MODES, TEXT_UNITS } from '#utils/edl/defaults.js';
import { EASINGS } from '#utils/edl/easing.js';
import { cleanBag, isPlainObject } from '#utils/edl/jsonBag.js';
import { cleanFont } from '#utils/brand/tokenClean.js';
import { LIMITS, isId } from '#utils/brand/limits.js';
import { ANCHORS, LAYER_TYPES, MOTIONS, SHAPES, SIDES } from './vocabulary.js';

const ALIGN = ['left', 'center', 'right'];
/** A value that holds a reference: resolved later, kept as written. */
const isRef = (/** @type {any} */ value) =>
  typeof value === 'string' && value.length <= LIMITS.text && /\{[\w.-]+\}/.test(value);

/** @type {Record<string, (value: any) => any>} Readers by kind; undefined = drop */
const READ = {
  num: (v) => (typeof v === 'number' && Number.isFinite(v) ? v : isRef(v) ? v : undefined),
  bool: (v) => (typeof v === 'boolean' ? v : isRef(v) ? v : undefined),
  id: (v) => (isId(v) ? v : undefined),
  text: (v) => (typeof v === 'string' ? v.slice(0, LIMITS.text) : undefined),
  path: (v) => (typeof v === 'string' && v.length <= LIMITS.path ? v : undefined),
  color: (v) => (isHex(v) || v === '' || isRef(v) ? v : undefined),
  value: (v) => (typeof v === 'boolean' || typeof v === 'number' ? v : READ.text(v)),
  width: (v) => (typeof v === 'string' && /^\d{1,3}(\.\d+)?%$/.test(v) ? v : READ.num(v)),
  pad: (v) => {
    const pair = Array.isArray(v) ? v.slice(0, 2).map(READ.num) : [READ.num(v)];
    if (pair.some((n) => n === undefined)) return undefined;
    return pair.length === 2 ? pair : pair[0];
  },
  font: (v) => (isRef(v) ? v : cleanFont(v)),
  bag: (v) => (isPlainObject(v) ? cleanBag(v) : undefined),
  travel: (v) => (v === 'out' ? v : READ.num(v)),
  motion: (v) => (typeof v === 'string' ? READ.motionName(v) : readShape(v, MOTION_FIELDS)),
  shadow: (v) => readShape(v, { color: 'color', blur: 'num', x: 'num', y: 'num' }),
  outline: (v) => readShape(v, { color: 'color', width: 'num' }),
  plate: (v) => readShape(v, { color: 'color', pad: 'num', radius: 'num' }),
};
/** @type {(list: readonly string[]) => (value: any) => any} */
const choice = (list) => (v) => (list.includes(v) || isRef(v) ? v : undefined);
READ.motionName = choice(MOTIONS);
READ.type = (v) => (LAYER_TYPES.includes(v) ? v : undefined);
READ.anchor = choice(Object.keys(ANCHORS));
READ.side = choice(SIDES);
READ.align = choice(ALIGN);
READ.blend = choice(BLEND_MODES);
READ.shape = choice(SHAPES);
READ.by = choice(TEXT_UNITS);
READ.ease = choice(EASINGS);

/** How a layer arrives or leaves, written out. */
const MOTION_FIELDS = {
  ...{ motion: 'motionName', delay: 'num', duration: 'num', by: 'by', ease: 'ease' },
  ...{ stagger: 'num', travel: 'travel', angle: 'num' },
};

/** Every field of a layer with its kind. */
export const LAYER_FIELDS = Object.freeze({
  ...{ id: 'id', type: 'type', when: 'value', unless: 'value' },
  ...{ in: 'id', at: 'anchor', inside: 'id', x: 'num', y: 'num' },
  ...{ around: 'id', beside: 'id', side: 'side', gap: 'num', span: 'num', thickness: 'num' },
  ...{ pad: 'pad', w: 'width', h: 'width', rotate: 'num', opacity: 'num', blend: 'blend' },
  ...{ enter: 'motion', exit: 'motion' },
  ...{ text: 'text', font: 'font', size: 'num', minSize: 'num', color: 'color' },
  ...{ align: 'align', maxWidth: 'width', lines: 'num', upper: 'bool' },
  ...{ tracking: 'num', lineHeight: 'num', weight: 'num', italic: 'bool' },
  ...{ shadow: 'shadow', outline: 'outline', plate: 'plate' },
  ...{ shape: 'shape', fill: 'color', stroke: 'color', strokeWidth: 'num', radius: 'num' },
  ...{ sides: 'num', points: 'num', inner: 'num' },
  ...{ src: 'path', generator: 'id', params: 'bag', lengths: 'bag', animate: 'bag', seed: 'num' },
});

/** Every field of a group with its kind. */
export const GROUP_FIELDS = Object.freeze({
  ...{ at: 'anchor', inside: 'id', x: 'num', y: 'num' },
  ...{ gap: 'num', align: 'align', pad: 'pad', maxWidth: 'width' },
});

/**
 * Read the fields of a table out of a raw object.
 * @param {any} raw
 * @param {Record<string, string>} fields - Field name → kind
 * @returns {Record<string, any>|undefined} The usable fields; undefined
 *   when `raw` is not a plain object
 */
export function readShape(raw, fields) {
  if (!isPlainObject(raw)) return undefined;
  /** @type {Record<string, any>} */
  const out = {};
  for (const [name, kind] of Object.entries(fields)) {
    if (!Object.hasOwn(raw, name)) continue;
    const value = READ[kind](raw[name]);
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/**
 * @param {any} value
 * @returns {boolean} True for a string that holds a `{reference}`
 */
export const holdsReference = isRef;
