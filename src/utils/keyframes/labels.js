/**
 * Names for property paths, as the keyframe strip and tooltips show them:
 * `transform.x` → "Position X", `effects.fx_1.radius` → "Blur · Radius",
 * `generator.params.center.x` → "Gradient · Centre X". Parameter names come
 * from the catalog schemas. Pure and isomorphic.
 * @module utils/keyframes/labels
 */

import { effectModule, generatorModule } from '#utils/compose/catalog.js';

/** @type {Record<string, string>} */
const FIXED = {
  volume: 'Volume',
  'transform.x': 'Position X',
  'transform.y': 'Position Y',
  'transform.scaleX': 'Scale width',
  'transform.scaleY': 'Scale height',
  'transform.rotation': 'Rotation',
  'transform.opacity': 'Opacity',
  'transform.cropTop': 'Crop top',
  'transform.cropBottom': 'Crop bottom',
  'transform.cropLeft': 'Crop left',
  'transform.cropRight': 'Crop right',
  'text.fontSize': 'Text size',
  'text.color': 'Text colour',
  'text.background': 'Box colour',
  'text.outlineColor': 'Outline colour',
  'text.outlineWidth': 'Outline width',
  'text.lineHeight': 'Line height',
  'text.letterSpacing': 'Letter spacing',
  'text.maxWidth': 'Wrap width',
  'text.boxPadding': 'Box padding',
  'text.boxRadius': 'Box radius',
  'text.shadowColor': 'Shadow colour',
  'text.shadowBlur': 'Shadow blur',
  'text.shadowX': 'Shadow X',
  'text.shadowY': 'Shadow Y',
  'generator.seed': 'Seed',
};

/**
 * `strokeWidth` → "Stroke width", `soft-light` → "Soft light".
 * @param {string} name
 * @returns {string}
 */
export function humanize(name) {
  const words = String(name ?? '')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

/**
 * Label of a parameter inside a schema, sub-keys appended ("Centre X").
 * @param {Record<string, any>|undefined} schema
 * @param {string[]} keys - Parameter name and anything under it
 * @returns {string}
 */
function paramLabel(schema, keys) {
  const [name, ...inner] = keys;
  const base = schema?.[name]?.label || humanize(name);
  return [base, ...inner.map((key) => key.toUpperCase())].join(' ');
}

/**
 * @param {any} clip - The clip the path belongs to
 * @param {string} path
 * @returns {string}
 */
export function pathLabel(clip, path) {
  if (FIXED[path] && path !== 'generator.seed') return FIXED[path];
  const parts = path.split('.');
  if (parts[0] === 'generator') {
    const module = generatorModule(clip?.generator?.type);
    const owner = module?.label || humanize(clip?.generator?.type || 'Generator');
    if (path === 'generator.seed') return `${owner} · Seed`;
    return `${owner} · ${paramLabel(module?.params, parts.slice(2))}`;
  }
  if (parts[0] === 'effects') {
    const effect = (clip?.effects || []).find((fx) => fx.effectId === parts[1]);
    const module = effectModule(effect?.type);
    const owner = module?.label || humanize(effect?.type || 'Effect');
    return `${owner} · ${paramLabel(module?.params, parts.slice(2))}`;
  }
  return humanize(parts[parts.length - 1]);
}
