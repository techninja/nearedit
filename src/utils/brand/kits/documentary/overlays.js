/**
 * The built-in `documentary` kit, its overlays: a serif on the picture
 * itself — no plates, a hairline in muted gold, a soft dark gradient where
 * the words sit — and slow fades, line by line. Pure data. Isomorphic.
 * @module utils/brand/kits/documentary/overlays
 */

import { mark } from '#utils/brand/kits/mark.js';
import { C, F, T, element, slot } from '#utils/brand/kits/parts.js';

const SHADE = { color: '#000000b3', blur: 1.4, y: 0.2 };
const leave = { motion: 'fade', duration: 0.5 };
const arrive = (/** @type {number} */ delay, duration = 0.7) => ({
  motion: T.enter,
  delay,
  duration,
});
/** Small spaced capitals, for what stands beside a serif line. */
const label = { font: F.body, weight: 700, upper: true, tracking: 0.16 };

/** Darkness rising from the bottom of the frame, for words low in the picture. */
const dusk = (/** @type {number} */ y, /** @type {number} */ size) => ({
  ...{ kind: 'linear', angle: 0, stops: 3, center: { x: 0.5, y }, size },
  ...{ color1: `${C.background}f2`, color2: `${C.background}c7`, color3: `${C.background}00` },
});
const footing = {
  ...{ id: 'footing', type: 'generator', generator: 'gradient', params: dusk(0.72, 0.56) },
  ...{ enter: { motion: 'fade', duration: 0.8 }, exit: { motion: 'fade', duration: 0.6 } },
};
const veil = (/** @type {string} */ alpha) => ({
  ...{ id: 'veil', type: 'shape', around: 'frame', fill: `${C.background}${alpha}` },
  ...{ enter: { motion: 'fade', duration: 0.8 }, exit: { motion: 'fade', duration: 0.6 } },
});
const hairline = { type: 'shape', h: T.stroke, fill: C.primary };

export const lowerThird = element('lower-third', {
  groups: { block: { at: 'bottom-left', align: 'left', gap: 1.1, maxWidth: 100 } },
  layers: [
    footing,
    {
      ...{ id: 'rule', ...hairline, in: 'block', w: 9 },
      ...{ enter: { motion: 'wipe', duration: 0.6 }, exit: leave },
    },
    {
      ...{ id: 'name', type: 'text', in: 'block', text: slot('name'), font: F.heading },
      ...{ size: 6.4, minSize: 3.8, color: C.text, lines: 2, shadow: SHADE, gap: 1.6 },
      ...{ enter: arrive(0.2), exit: leave },
    },
    {
      ...{ id: 'role', type: 'text', in: 'block', when: slot('role'), text: slot('role') },
      ...{ ...label, size: 2.9, minSize: 2.2, color: C.muted, lines: 2 },
      ...{ enter: arrive(0.5), exit: leave },
    },
  ],
  formats: {
    tall: {
      groups: { block: { y: -14, maxWidth: '100%' } },
      layers: { name: { size: 7.2 }, role: { size: 3.3 }, footing: { params: dusk(0.76, 0.48) } },
    },
    square: { groups: { block: { y: -3, maxWidth: '100%' } } },
  },
});

export const title = element('title', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.6, maxWidth: '82%' } },
  layers: [
    veil('bd'),
    { ...{ id: 'above', ...hairline, in: 'stack', w: 7 }, enter: arrive(0, 0.6), exit: leave },
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ italic: true, size: 10, minSize: 4.6, color: C.text, lines: 4 },
      ...{ enter: arrive(0.2, 0.9), exit: leave },
    },
    {
      ...{ id: 'subtitle', type: 'text', in: 'stack', when: slot('subtitle') },
      ...{ text: slot('subtitle'), ...label, size: 3.3, color: C.muted, lines: 3 },
      ...{ enter: arrive(0.7), exit: leave },
    },
    { ...{ id: 'below', ...hairline, in: 'stack', w: 7 }, enter: arrive(0.9, 0.6), exit: leave },
  ],
});

export const caption = element('caption', {
  layers: [
    {
      ...{ id: 'text', type: 'text', at: 'bottom', text: slot('text'), font: F.body },
      ...{ weight: 700, size: 4.2, minSize: 3, color: C.text, lines: 3, maxWidth: '82%' },
      ...{ align: 'center', outline: { color: '#000000d9', width: 0.3 } },
      ...{ enter: { motion: 'fade', duration: 0.2, by: 'block' } },
      ...{ exit: { motion: 'fade', duration: 0.2 } },
    },
  ],
  formats: { tall: { layers: { text: { y: -16, size: 4.8, maxWidth: '100%' } } } },
});

export const quote = element('quote', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.8, maxWidth: '76%' } },
  layers: [
    veil('cc'),
    {
      ...{ id: 'open', type: 'text', in: 'stack', text: '“', font: F.heading, size: 20 },
      ...{ color: C.primary, lineHeight: 0.55, lines: 1, enter: arrive(0, 0.6), exit: leave },
    },
    {
      ...{ id: 'text', type: 'text', in: 'stack', text: slot('text'), font: F.heading },
      ...{ italic: true, size: 6.6, minSize: 3.8, color: C.text, lines: 6 },
      ...{ lineHeight: 1.3, gap: 0.4, enter: arrive(0.3, 1.1), exit: leave },
    },
    {
      ...{ id: 'by', type: 'text', in: 'stack', when: slot('by'), text: slot('by') },
      ...{ ...label, size: 3.1, color: C.primary, lines: 2 },
      ...{ enter: arrive(1.1), exit: leave },
    },
  ],
});

export const bug = element('bug', {
  layers: mark({
    ...{ size: 7, place: { at: 'top-right' }, base: `${C.background}80` },
    ...{ stroke: C.primary, strokeWidth: 0.22, ink: C.primary, shape: 'ellipse', figure: 'dot' },
    ...{ enter: { motion: 'fade', duration: 1 }, exit: { motion: 'fade', duration: 1 } },
  }),
});
