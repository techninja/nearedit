/**
 * Particle parameters, second half: what a particle looks like — its
 * sprite, size, turning, colour and opacity over its life.
 * Reference: docs/app-spec/PARTICLES.md.
 * @module utils/compose/generators/particles/schemaLook
 */

import { EASINGS } from '#utils/edl/easing.js';
import { SPRITES } from './shapes.js';
import { color, fixed, flag, num, pick, share } from './spec.js';

/** How particles combine with each other inside their layer. */
export const BLENDS = { normal: 'source-over', add: 'lighter', screen: 'screen' };
/** A particle takes its colour from this many colours at most. */
export const MAX_COLORS = 5;

const COLORS = ['#ffffff', '#7dd3fc', '#f472b6', '#fde047', '#4ade80'];
const pictured = { sprite: ['image'] };

/** @type {import('#utils/compose/params.js').ParamSchema} */
const colorParams = {};
for (let i = 1; i <= MAX_COLORS; i++) {
  const from = Array.from({ length: MAX_COLORS - i + 1 }, (_, k) => i + k);
  const when = i > 1 ? { when: { colors: from } } : {};
  colorParams[`color${i}`] = color(COLORS[i - 1], `Colour ${i}`, when);
}

/** @type {import('#utils/compose/params.js').ParamSchema} */
export const spriteParams = {
  sprite: pick([...SPRITES, 'image'], 'Sprite'),
  image: { type: 'image', default: '', label: 'Image', when: pictured },
  tint: share(0, 'Tint the image with the colour', { when: pictured }),
  blend: pick(Object.keys(BLENDS), 'Blend between particles', { default: 'add' }),
  size: num(40, 0, 4000, 'Size', { unit: 'px' }),
  sizeJitter: share(0.3, 'Size variation'),
  sizeStart: num(1, 0, 20, 'Size at birth (×)', { step: 0.01 }),
  sizeEnd: num(1, 0, 20, 'Size at death (×)', { step: 0.01 }),
  sizeCurve: pick(EASINGS, 'Size curve'),
};

/** @type {import('#utils/compose/params.js').ParamSchema} */
export const turnParams = {
  rotation: num(0, -3600, 3600, 'Rotation', { unit: '°' }),
  rotationSpread: num(0, 0, 360, 'Rotation variation', { unit: '°' }),
  spin: num(0, -7200, 7200, 'Spin', { unit: '°/s' }),
  spinSpread: num(0, 0, 7200, 'Spin variation', { unit: '°/s' }),
  flip: num(0, 0, 20, 'Tumble', { unit: '/s', step: 0.01 }),
  align: flag(false, 'Point along the direction of travel'),
  stretch: num(0, 0, 2, 'Stretch along travel', { unit: 's', step: 0.001 }),
};

/** @type {import('#utils/compose/params.js').ParamSchema} */
export const shadeParams = {
  colorMode: pick(['life', 'random'], 'Colours are'),
  colors: fixed(2, 1, MAX_COLORS, 'Colours', { step: 1 }),
  ...colorParams,
  opacity: share(1, 'Opacity'),
  fadeIn: share(0.1, 'Fade in (share of life)'),
  fadeOut: share(0.5, 'Fade out (share of life)'),
  twinkle: share(0, 'Twinkle'),
  twinkleSpeed: fixed(2, 0, 60, 'Twinkle rate', { unit: '/s', step: 0.1 }),
};
