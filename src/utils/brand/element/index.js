/**
 * The element language — public surface. (The reference follows.)
 * @module utils/brand/element
 */

export {
  ANCHORS,
  FORMATS,
  KINDS,
  LAYER_TYPES,
  MOTIONS,
  SHAPES,
  SIDES,
  formatOf,
} from './vocabulary.js';
export { GROUP_FIELDS, LAYER_FIELDS } from './fields.js';
export { normalizeDesign, normalizeElement } from './normalize.js';
export { resolveElement } from './resolve.js';
export { coverTime, expandElement } from './expand.js';
export { estimateMeasure } from './measure.js';
export { elementNeeds } from './needs.js';
