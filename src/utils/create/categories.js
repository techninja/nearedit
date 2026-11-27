/**
 * Headings and icons for the categories of the catalog. The contract names
 * a few; a module may bring its own, which is then shown under its
 * humanised name with a generic icon. Pure data.
 * @module utils/create/categories
 */

import { humanize } from '#utils/keyframes/labels.js';

/** Headings for the categories the contract names; others are humanised. */
const CATEGORY_LABELS = {
  background: 'Backgrounds',
  shape: 'Shapes',
  pattern: 'Patterns',
  particles: 'Particles',
  text: 'Text',
  color: 'Colour',
  blur: 'Blur',
  stylize: 'Stylize',
  light: 'Light',
  key: 'Keying',
  distort: 'Distort',
  looks: 'Looks',
};

/** Icons for categories; anything else gets the generic one. */
const CATEGORY_ICONS = {
  background: 'image',
  shape: 'shapes',
  pattern: 'grid-3',
  particles: 'particles',
  text: 'title',
  color: 'palette',
  blur: 'blur',
  stylize: 'brush',
  light: 'brightness',
  key: 'pipette',
  distort: 'waves',
  looks: 'sparkle',
};

/** @type {(category: string) => string} */
export const categoryLabel = (category) =>
  CATEGORY_LABELS[category] || humanize(category) || 'Other';

/** @type {(category: string) => string} */
export const categoryIcon = (category) => CATEGORY_ICONS[category] || 'sparkle';
