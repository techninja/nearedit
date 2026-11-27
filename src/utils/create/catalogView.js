/**
 * The catalog as the Create tab lists it: generators as tiles (one for
 * each generator, one more for each preset its module exports), effects as
 * rows, both grouped by category and narrowed by a search. Everything is
 * read from the catalog — a module added to it shows up here by itself.
 * Pure and isomorphic.
 * @module utils/create/catalogView
 */

import { humanize } from '#utils/keyframes/labels.js';
import { categoryLabel } from './categories.js';
import { presetsOf } from './presets.js';

/**
 * Something the Create tab can add or apply.
 * @typedef {Object} CatalogItem
 * @property {string} key - Unique in its list
 * @property {string} type - Catalog type
 * @property {string} label
 * @property {string} category
 * @property {string} description
 * @property {Record<string, any>} [params] - A preset's parameters
 * @property {number} [seed] - A preset's seed
 * @property {string} [blendMode] - A preset's blend mode for the clip
 * @property {string} [preset] - Label of the preset this item stands for
 */

/** @typedef {{ category: string, label: string, items: CatalogItem[] }} CatalogGroup */

/**
 * Generators as tiles: each generator with its defaults, then its presets.
 * @param {{ type: string, label: string, category: string, description?: string,
 *   presets?: any[] }[]} generators - Catalog entries
 * @returns {CatalogItem[]}
 */
export function generatorItems(generators) {
  return generators.flatMap((entry) => {
    const { type, label, category } = entry;
    const base = { type, category, description: entry.description || '' };
    const presets = presetsOf(entry).map((preset) => ({
      ...base,
      key: `${type}:${preset.id}`,
      label: preset.label,
      description: preset.description || `${label} preset`,
      params: preset.params,
      ...(preset.seed !== undefined && { seed: preset.seed }),
      ...(preset.blendMode && { blendMode: preset.blendMode }),
      preset: preset.label,
    }));
    return [{ ...base, key: type, label: label || humanize(type) }, ...presets];
  });
}

/**
 * Effects as rows.
 * @param {{ type: string, label: string, category: string, description?: string }[]} effects
 * @returns {CatalogItem[]}
 */
export function effectItems(effects) {
  return effects.map(({ type, label, category, description }) => ({
    key: type,
    type,
    label: label || humanize(type),
    category,
    description: description || '',
  }));
}

/**
 * Keep the items a search matches: every word must appear in the label,
 * the type, the category or the description.
 * @param {CatalogItem[]} items
 * @param {string} query
 * @returns {CatalogItem[]}
 */
export function searchItems(items, query) {
  const words = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => {
    const text = [item.label, item.type, categoryLabel(item.category), item.description]
      .join(' ')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/**
 * Group items by category, categories in the order they first appear.
 * @param {CatalogItem[]} items
 * @returns {CatalogGroup[]}
 */
export function groupByCategory(items) {
  /** @type {Map<string, CatalogItem[]>} */
  const groups = new Map();
  for (const item of items) {
    const category = item.category || 'other';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }
  return [...groups].map(([category, list]) => ({
    category,
    label: categoryLabel(category),
    items: list,
  }));
}
