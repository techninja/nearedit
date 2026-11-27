/**
 * What the effect list offers: every effect of the catalog, the presets a
 * catalog entry lists (the effect with other starting values), and the
 * looks the library exports (`EFFECT_PRESETS`: `{ name, label,
 * description, effects: [{ type, params }] }`, several effects added in
 * one go; nothing is shown when the library has none). All of it is read
 * from the compositor library at call time, so what is added there
 * appears here.
 * @module utils/create/effectList
 */

import * as compose from '#utils/compose/index.js';
import { effectItems } from './catalogView.js';
import { presetsOf } from './presets.js';

/** @typedef {import('./catalogView.js').CatalogItem} CatalogItem */

/**
 * @typedef {CatalogItem & { effects?: { type: string, params?: Record<string, any> }[] }} EffectItem -
 *   `effects`: a chain; without it the item is one effect (`type`, `params`)
 */

/** Category the chains are listed under. */
export const CHAIN_CATEGORY = 'looks';

/**
 * The chains the library exports, as items. Entries without a usable list
 * of effects are left out.
 * @param {any} [library] - The compositor's exports (injected by tests)
 * @returns {EffectItem[]}
 */
export function effectChains(library = compose) {
  const list = Array.isArray(library?.EFFECT_PRESETS) ? library.EFFECT_PRESETS : [];
  return list
    .filter((chain) => chain?.label && Array.isArray(chain.effects) && chain.effects.length > 0)
    .map((chain, index) => ({
      key: `chain:${chain.name || chain.id || index}`,
      type: '',
      label: String(chain.label),
      category: CHAIN_CATEGORY,
      description: typeof chain.description === 'string' ? chain.description : '',
      effects: chain.effects
        .filter((/** @type {any} */ fx) => typeof fx?.type === 'string' && fx.type)
        .map((/** @type {any} */ fx) => ({ type: fx.type, params: fx.params || {} })),
    }));
}

/**
 * Everything the effect list shows: chains first, then each effect followed
 * by its presets.
 * @param {any} [library]
 * @returns {EffectItem[]}
 */
export function allEffectItems(library = compose) {
  const entries = library.EFFECTS || [];
  const effects = effectItems(entries).flatMap((item, index) => [
    item,
    ...presetsOf(entries[index]).map((preset) => ({
      ...item,
      key: `${item.type}:${preset.id}`,
      label: `${item.label} — ${preset.label}`,
      description: preset.description || item.description,
      params: preset.params,
      preset: preset.label,
    })),
  ]);
  return [...effectChains(library), ...effects];
}

/**
 * The effect-stack action that applying an item means.
 * @param {EffectItem} item
 * @returns {import('#utils/inspector/effectActions.js').EffectAction}
 */
export function actionFor(item) {
  if (item.effects) return { action: 'chain', effects: item.effects };
  return { action: 'add', type: item.type, params: item.params };
}
