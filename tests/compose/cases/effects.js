/**
 * Reference documents: the effects library — every effect once or twice,
 * on an opaque picture and on a layer with transparency, plus chains.
 * @module tests/compose/cases/effects
 */

import { EFFECT_PRESETS } from '#utils/compose/effects/presets.js';
import { doc, gen, media } from '../build.js';
import { sky } from './generators.js';

/** An effect stack from `[type, params]` pairs. */
const stack = (/** @type {[string, object?][]} */ ...list) =>
  list.map(([type, params = {}], i) => ({ effectId: `fx_${i}`, type, enabled: true, params }));

const star = { shape: 'star', fill: '#f97316', stroke: '#fff7ed', strokeWidth: 10 };
const smaller = { fit: 'contain', scaleX: 0.75, scaleY: 0.75 };

/**
 * @param {{ card: string, logo: string }} files - Fixture pictures
 * @returns {Record<string, any>} Documents by case name. Clip `a` with a
 *   `.mp4` source is footage: give it the card as its frame
 */
export function effectDocs({ card, logo }) {
  /** The opaque card filling the frame, with effects. */
  const full = (/** @type {[string, object?][]} */ ...list) =>
    doc([[media('a', card, { effects: stack(...list) })]]);
  /** The soft-edged logo over a gradient, with effects. */
  const soft = (/** @type {[string, object?][]} */ ...list) =>
    doc([[media('a', logo, { transform: smaller, effects: stack(...list) })], [sky()]]);
  /** A star on transparency over a gradient, with effects. */
  const cut = (/** @type {[string, object?][]} */ ...list) =>
    doc([[gen('a', 'shape', star, { effects: stack(...list) })], [sky()]]);
  /** The card as a smaller picture over a gradient: its edges are inside the frame. */
  const inset = (/** @type {[string, object?][]} */ ...list) =>
    doc([[media('a', card, { transform: smaller, effects: stack(...list) })], [sky()]]);
  const vhs = EFFECT_PRESETS.find((preset) => preset.name === 'vhs').effects;
  return {
    'fx-color-adjust': full([
      'colorAdjust',
      { brightness: 1.1, contrast: 1.3, saturation: 1.4, hue: 25 },
    ]),
    'fx-color-exposure': soft(['colorAdjust', { exposure: -1, saturation: 0.3 }]),
    'fx-color-balance': full(['colorBalance', { temperature: 0.6, tint: -0.3, blue: 1.2 }]),
    'fx-levels': full(['levels', { black: 0.1, white: 0.85, midtones: 0.4, outBlack: 0.05 }]),
    'fx-levels-soft': soft(['levels', { midtones: -0.7, outWhite: 0.8 }]),
    'fx-tint-colorize': full(['tint', { color: '#2563eb', amount: 0.8 }]),
    'fx-tint-duotone': soft(['tint', { mode: 'duotone' }]),
    'fx-stylize': full(['stylize', { grayscale: 0.3, sepia: 0.8, invert: 0.15 }]),
    'fx-posterize': full(['posterize', { levels: 5 }]),
    'fx-blur-wide': full(['blur', { radius: 60 }]),
    'fx-blur-directional': cut(['blur', { kind: 'directional', radius: 48, angle: 25 }]),
    'fx-blur-streak': full(['blur', { kind: 'directional', radius: 30 }]),
    'fx-glow-threshold': full(['glow', { radius: 30, intensity: 1, threshold: 0.6 }]),
    'fx-glow-fine': cut(['glow', { radius: 6, intensity: 1.5 }]),
    'fx-drop-shadow': cut(['dropShadow', { x: 30, y: 24, blur: 14, color: '#1e1b4b' }]),
    'fx-vignette': full([
      'vignette',
      { amount: 0.8, size: 0.6, softness: 0.5, roundness: 0.4, color: '#1e1b4b' },
    ]),
    'fx-pixelate': full(['pixelate', { size: 48 }]),
    'fx-pixelate-soft': soft(['pixelate', { size: 32 }]),
    'fx-chroma-key': inset([
      'chromaKey',
      { color: '#7c3aed', tolerance: 0.15, softness: 0.15, spill: 0.6 },
    ]),
    'fx-wipe-linear': inset(['wipe', { progress: 0.45, angle: 20, feather: 120 }]),
    'fx-wipe-radial': inset(['wipe', { shape: 'radial', progress: 0.4, feather: 60 }]),
    'fx-wipe-iris': inset(['wipe', { shape: 'iris', angle: 45, feather: 40, invert: true }]),
    'fx-wipe-clock': inset(['wipe', { shape: 'clock', progress: 0.3, angle: 40, feather: 80 }]),
    'fx-rgb-split': full(['rgbSplit', { distance: 14, angle: 20 }]),
    'fx-rgb-split-soft': soft(['rgbSplit', { distance: 22 }]),
    'fx-grain': full(['grain', { amount: 0.4, size: 6, colored: true }]),
    'fx-mask-ellipse': inset(['mask', { feather: 60, width: 0.5, height: 0.6 }]),
    'fx-mask-rectangle': inset([
      'mask',
      { shape: 'rectangle', radius: 60, rotation: 12, feather: 8, invert: true },
    ]),
    'fx-scanlines': full(['scanlines', { spacing: 14, speed: 30, opacity: 0.5 }]),
    // Tilted lines go through the canvas's path anti-aliasing, which is only
    // approximate for lines a pixel or two wide: these are wide enough.
    'fx-scanlines-tilted': full([
      'scanlines',
      { spacing: 60, thickness: 0.3, angle: 20, color: '#ffffff', opacity: 0.4 },
    ]),
    'fx-flicker': full(['flicker', { amount: 0.5 }]),
    'fx-mirror': full(['mirror', { mode: 'quad' }]),
    // Filters that merge into one pass, then apply effects, on footage.
    'fx-chain-grade': doc([
      [
        media('a', '/media/clip.mp4', {
          effects: stack(
            ['colorAdjust', { contrast: 1.2, saturation: 0.8 }],
            ['stylize', { sepia: 0.3 }],
            ['levels', { outBlack: 0.06 }],
            ['vignette', {}],
            ['grain', { amount: 0.2, size: 4 }],
          ),
        }),
      ],
    ]),
    // A track of two layers with transparency through effects that reach past them.
    'fx-chain-track': doc([
      {
        effects: stack(
          ['glow', { radius: 24, intensity: 1.2 }],
          ['rgbSplit', { distance: 12, angle: 30 }],
          ['wipe', { shape: 'radial', progress: 0.62, feather: 80 }],
          ['dropShadow', { x: 20, y: 20, blur: 10 }],
        ),
        clips: [gen('s', 'shape', star, { transform: { x: -380 } })],
      },
      [media('b', logo, { transform: { ...smaller, x: 420 }, effects: stack(['tint', {}]) })],
      [sky()],
    ]),
    'fx-preset-vhs': doc([
      [media('a', card, { effects: stack(...vhs.map((e) => [e.type, e.params])) })],
    ]),
  };
}
