/**
 * The two finishing touches of a cut-out person: a shadow that follows
 * their shape and a sticker's outline around it. Each is an ordinary effect
 * on the clip — `dropShadow`, `outline` — so the buttons only add or remove
 * it, and its settings are edited in the effect stack below like any
 * other. Pure and isomorphic.
 * @module utils/cutoutUi/looks
 */

import { effectModule } from '#utils/compose/catalog.js';
import { addEffect, removeEffect, setEffectEnabled } from '#utils/edl/effects.js';
import { parseResolution } from '#utils/edl/factory.js';
import { findClip } from '#utils/edl/query.js';

/** @typedef {'shadow'|'outline'} Look */

/** The effect behind each look. */
export const LOOK_EFFECTS = { shadow: 'dropShadow', outline: 'outline' };

/** A soft shadow that reads as a person standing in front: lengths for a frame 1080 high. */
const SHADOW = { x: 10, y: 16, blur: 26, opacity: 0.55 };

/**
 * The looks this build can offer: an effect that is not in the catalog has
 * no button.
 * @returns {{ id: Look, label: string, hint: string }[]}
 */
export function availableLooks() {
  /** @type {{ id: Look, label: string, hint: string }[]} */
  const looks = [
    { id: 'shadow', label: 'Shadow', hint: 'A soft shadow that follows the person’s shape' },
    { id: 'outline', label: 'Outline', hint: 'A sticker’s border around the person' },
  ];
  return looks.filter((look) => Boolean(effectModule(LOOK_EFFECTS[look.id])));
}

/**
 * @param {any} clip
 * @param {Look} look
 * @returns {boolean} True when the clip has that effect, switched on
 */
export function hasLook(clip, look) {
  const type = LOOK_EFFECTS[look];
  return (clip?.effects || []).some((fx) => fx.type === type && fx.enabled !== false);
}

/**
 * The parameters a look starts with.
 * @param {Look} look
 * @param {number} height - Of the output frame, pixels
 * @returns {Record<string, any>} Only what differs from the effect's defaults
 */
function startParams(look, height) {
  if (look !== 'shadow') return {};
  const k = height / 1080;
  const scaled = Object.entries(SHADOW).map(([name, value]) => [
    name,
    name === 'opacity' ? value : Math.round(value * k),
  ]);
  return Object.fromEntries(scaled);
}

/**
 * Give clips a look, or take it away. On: an effect of that type that is
 * switched off is switched on, otherwise one is added — the outline before
 * a shadow, so the shadow is cast by the outlined shape. Off: every effect
 * of that type goes.
 * @param {any} edl
 * @param {string[]} clipIds
 * @param {Look} look
 * @param {boolean} on
 * @returns {any} The same document when nothing changed
 */
export function setLook(edl, clipIds, look, on) {
  const type = LOOK_EFFECTS[look];
  if (!type || !effectModule(type)) return edl;
  const params = startParams(look, parseResolution(edl.resolution).height);
  return clipIds.reduce((doc, clipId) => {
    const effects = findClip(doc, clipId)?.clip.effects || [];
    const mine = effects.filter((fx) => fx.type === type);
    if (!on) return mine.reduce((next, fx) => removeEffect(next, clipId, fx.effectId), doc);
    if (mine.some((fx) => fx.enabled !== false)) return doc;
    if (mine.length) return setEffectEnabled(doc, clipId, mine[0].effectId, true);
    const shadowAt = effects.findIndex((fx) => fx.type === LOOK_EFFECTS.shadow);
    const index = look === 'outline' && shadowAt >= 0 ? shadowAt : effects.length;
    return addEffect(doc, clipId, type, { params, index });
  }, edl);
}
