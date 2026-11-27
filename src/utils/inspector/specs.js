/**
 * Inspector field specs: range, step, precision and unit of every number
 * the inspector edits, keyed by the clip path it writes. Ranges mirror the
 * clamps of `updateClip` (`#utils/edl/sanitize.js`). Pure.
 * @module utils/inspector/specs
 */

/** @typedef {import('./numberField.js').NumberSpec} NumberSpec */

const PERCENT = { min: 0, max: 1, step: 0.01, scale: 100, decimals: 0, unit: '%' };
const PIXELS = { step: 1, decimals: 0, unit: 'px' };
const ZOOM = { min: 0.01, max: 20, step: 0.01, scale: 100, decimals: 0, unit: '%' };
const SECONDS = { min: 0, step: 0.1, decimals: 2, unit: 's' };

/** @type {Record<string, NumberSpec>} */
export const FIELD_SPECS = {
  volume: { ...PERCENT, max: 2 },
  fadeIn: SECONDS,
  fadeOut: SECONDS,
  'transform.x': PIXELS,
  'transform.y': PIXELS,
  'transform.scale': ZOOM,
  'transform.scaleX': ZOOM,
  'transform.scaleY': ZOOM,
  'transform.rotation': { min: -360, max: 360, step: 1, decimals: 1, unit: '°' },
  'transform.opacity': PERCENT,
  'transform.cropTop': { ...PERCENT, max: 0.95 },
  'transform.cropBottom': { ...PERCENT, max: 0.95 },
  'transform.cropLeft': { ...PERCENT, max: 0.95 },
  'transform.cropRight': { ...PERCENT, max: 0.95 },
  'transform.kenBurns.startX': PIXELS,
  'transform.kenBurns.startY': PIXELS,
  'transform.kenBurns.startScale': ZOOM,
  'transform.kenBurns.endX': PIXELS,
  'transform.kenBurns.endY': PIXELS,
  'transform.kenBurns.endScale': ZOOM,
  'text.fontSize': { min: 1, max: 4000, step: 1, decimals: 0, unit: 'px' },
  'text.outlineWidth': { min: 0, max: 200, step: 1, decimals: 0, unit: 'px' },
};

/**
 * Full names for fields whose visible label is a single letter (X, Y, W…),
 * read out by screen readers and shown as tooltips.
 * @type {Record<string, string>}
 */
export const FIELD_NAMES = {
  fadeIn: 'Fade in',
  fadeOut: 'Fade out',
  'transform.x': 'Position X',
  'transform.y': 'Position Y',
  'transform.scale': 'Scale',
  'transform.scaleX': 'Scale width',
  'transform.scaleY': 'Scale height',
  'transform.cropTop': 'Crop top',
  'transform.cropBottom': 'Crop bottom',
  'transform.cropLeft': 'Crop left',
  'transform.cropRight': 'Crop right',
  'transform.kenBurns.startX': 'Ken Burns start X',
  'transform.kenBurns.startY': 'Ken Burns start Y',
  'transform.kenBurns.startScale': 'Ken Burns start scale',
  'transform.kenBurns.endX': 'Ken Burns end X',
  'transform.kenBurns.endY': 'Ken Burns end Y',
  'transform.kenBurns.endScale': 'Ken Burns end scale',
};

/**
 * @param {string} name - Field path, e.g. `transform.opacity`
 * @returns {NumberSpec} An unconstrained whole-number spec for unknown names
 */
export const specFor = (name) => FIELD_SPECS[name] || { step: 1, decimals: 2 };
