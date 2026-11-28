/**
 * What is wrong with an element or a design, for people: each problem with
 * the path of what it concerns. An element is checked as its author wrote
 * it — a field the language does not have, a reference to a token or a slot
 * that does not exist, a layer placed by something that is not there, a
 * generator nobody knows. Reading (`normalize.js`) never complains; this
 * does. Isomorphic and pure.
 * @module utils/brand/element/validate
 */

import { generatorModule } from '#utils/compose/catalog.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';
import { LIMITS } from '#utils/brand/limits.js';
import { GROUP_FIELDS, LAYER_FIELDS } from './fields.js';
import { checkFields } from './validateFields.js';
import { FRAME_REFS, KINDS, LAYER_TYPES } from './vocabulary.js';

/** @typedef {import('#utils/brand/types.js').Problem} Problem */
/** @typedef {(path: string, message: string, level?: 'error'|'warning') => void} Report */

const HEAD = ['label', 'kind', 'duration', 'minDuration', 'cover', 'margin', 'slots'];
const BODY = ['groups', 'layers', 'formats', 'motion', 'fonts'];
const NEEDS = { text: 'text', image: 'src', generator: 'generator' };

/**
 * Check an element as a kit defines it, or a design as a clip carries it.
 * @param {any} element
 * @param {string} path - Where it is, e.g. `elements.lower-third`
 * @param {Report} report
 * @param {{ design?: boolean }} [opts] - `design`: its slots are a list of
 *   names and its tokens should all be filled in
 */
export function checkElement(element, path, report, opts = {}) {
  if (!isPlainObject(element)) return report(path, 'must be an object');
  for (const key of Object.keys(element)) {
    if (![...HEAD, ...BODY].includes(key)) report(`${path}.${key}`, 'is not a field', 'warning');
  }
  if (element.kind !== undefined && !KINDS.includes(element.kind)) {
    report(`${path}.kind`, `must be one of ${KINDS.join(', ')}`);
  }
  const [shortest, longest] = LIMITS.duration;
  for (const key of ['duration', 'minDuration'].filter((name) => element[name] !== undefined)) {
    if (!(element[key] >= shortest && element[key] <= longest)) {
      report(`${path}.${key}`, `must be ${shortest} … ${longest} seconds`);
    }
  }
  const layers = Array.isArray(element.layers) ? element.layers : [];
  if (!layers.length) return report(`${path}.layers`, 'has no layers: the element draws nothing');
  if (layers.length > LIMITS.layers) report(`${path}.layers`, `holds more than ${LIMITS.layers}`);
  const names = opts.design ? element.slots : Object.keys(element.slots || {});
  const groups = new Set(Object.keys(isPlainObject(element.groups) ? element.groups : {}));
  const ids = layers.map((layer) => layer?.id).filter((id) => typeof id === 'string');
  const known = {
    slots: new Set(Array.isArray(names) ? names : []),
    boxes: new Set([...FRAME_REFS, ...groups, ...ids]),
    groups,
    tokens: !opts.design,
  };
  for (const id of groups)
    checkFields(element.groups[id], GROUP_FIELDS, `${path}.groups.${id}`, known, report);
  layers.forEach((layer, i) => {
    const at = `${path}.layers[${i}]`;
    if (!isPlainObject(layer)) return report(at, 'must be an object');
    if (!LAYER_TYPES.includes(layer.type)) {
      return report(`${at}.type`, `must be one of ${LAYER_TYPES.join(', ')}`);
    }
    checkFields(layer, LAYER_FIELDS, at, known, report);
    const needs = NEEDS[layer.type];
    if (needs && typeof layer[needs] !== 'string')
      report(`${at}.${needs}`, `a ${layer.type} layer needs it`);
    if (ids.indexOf(layer.id) !== i && layer.id !== undefined && ids.includes(layer.id)) {
      report(`${at}.id`, `"${layer.id}" is used by an earlier layer`, 'warning');
    }
    if (
      layer.type === 'generator' &&
      typeof layer.generator === 'string' &&
      !generatorModule(layer.generator)
    ) {
      report(`${at}.generator`, `unknown generator "${layer.generator}"`);
    }
  });
  for (const [format, patch] of Object.entries(
    isPlainObject(element.formats) ? element.formats : {},
  )) {
    for (const [id, change] of Object.entries(patch?.layers || {})) {
      const at = `${path}.formats.${format}.layers.${id}`;
      if (!ids.includes(id)) report(at, `no layer has the id "${id}"`, 'warning');
      else if (isPlainObject(change)) checkFields(change, LAYER_FIELDS, at, known, report);
    }
  }
}

/**
 * What is wrong with a design a clip carries.
 * @param {any} design
 * @param {string} [path] - Where it is, e.g. `tracks[0].clips[2].element.design`
 * @returns {Problem[]} Empty when it can be drawn as it is meant
 */
export function validateDesign(design, path = 'design') {
  /** @type {Problem[]} */
  const problems = [];
  checkElement(
    design,
    path,
    (at, message, level = 'error') => void problems.push({ path: at, message, level }),
    {
      design: true,
    },
  );
  return problems;
}
