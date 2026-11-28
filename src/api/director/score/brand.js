/**
 * A score in the project's brand: when the form leaves the style to the
 * brand — the default — the music is in the kit's musical style and key,
 * unless the brief names another style. The same for the key.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Score.
 * @module api/director/score/brand
 */

import { BRAND } from '#utils/director/brand/theme.js';
import { brandSound, stylesIn } from '#utils/director/score/brand.js';
import { styleInText } from '#utils/director/score/styles.js';
import { kitName, kitOf } from '../brand/kit.js';

/** @typedef {import('#utils/director/score/style.js').Style} Style */

/**
 * What the brand says about a score.
 * @param {Object} given
 * @param {Record<string, any>} given.params
 * @param {string} given.prompt - The brief
 * @param {{ style?: string }} given.plan
 * @param {import('#utils/brand/types.js').Kit} [given.kit]
 * @param {() => { style: Style, why: string }} given.auto - The choice by the timeline
 * @returns {{ style: Style|null, notes: string[], key: string, keyNote: string, scale: string }} `style`
 *   is null when the request does not leave the style to the brand; `key`
 *   and `scale` are '' when it does not leave the key to it
 */
export function brandChoice({ params, prompt, kit, auto }) {
  const none = { style: null, notes: [], key: '', keyNote: '', scale: '' };
  if (params.style !== BRAND && params.key !== BRAND) return none;
  const from = kitOf({ kit });
  const sound = brandSound(from);
  const name = kitName(from);
  const key = params.key === BRAND ? sound.key : '';
  const keyNote = key ? `Key ${key}: the brand kit’s (“${name}”).` : '';
  if (params.style !== BRAND) return { ...none, key, keyNote, scale: sound.scale };
  const named = styleInText(prompt);
  if (named) {
    return {
      ...{ style: named, key, keyNote, scale: '' },
      notes: [`Style ${named.label} — the brief names it, so the brand’s style steps back.`],
    };
  }
  if (sound.style) {
    return {
      ...{ style: sound.style, key, keyNote, scale: sound.scale },
      notes: [`Style ${sound.style.label} — the musical style of the brand kit “${name}”.`],
    };
  }
  // A style the director does not write: the timeline chooses, among those in the kit's scale.
  const chosen = auto();
  const suits = stylesIn(sound.scale);
  const style = suits.includes(chosen.style) ? chosen.style : suits[0];
  const why = sound.word
    ? `the kit “${name}” asks for “${sound.word}”, which the director does not write`
    : `the kit “${name}” names no musical style`;
  return {
    ...{ style, key, keyNote, scale: sound.scale },
    notes: [`Style ${style.label} — ${why}; chosen for ${chosen.why}.`],
  };
}

/**
 * The line that tells a language model about the brand's sound.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {string} '' when the request does not leave the style to the brand
 */
export function soundLine(ctx) {
  if (ctx.directive.params.style !== BRAND) return '';
  const kit = kitOf(ctx);
  const sound = brandSound(kit);
  if (!sound.style) return '';
  return (
    `Brand: the kit “${kitName(kit)}” sounds like ${sound.style.id}. Use that style ` +
    'unless the request asks for another.'
  );
}
