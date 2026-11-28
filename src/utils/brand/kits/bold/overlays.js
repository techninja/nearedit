/**
 * The built-in `bold` kit, its overlays: tall condensed capitals on solid
 * blocks of colour, square corners, everything wiped on fast.
 * Pure data. Isomorphic.
 * @module utils/brand/kits/bold/overlays
 */

import { mark } from '#utils/brand/kits/mark.js';
import { C, F, element, slot } from '#utils/brand/kits/parts.js';

const on = (/** @type {number} */ delay) => ({ motion: 'wipe', delay, duration: 0.3 });
const off = { motion: 'wipe', duration: 0.25 };

export const lowerThird = element('lower-third', {
  groups: { block: { at: 'bottom-left', align: 'left', gap: 0, maxWidth: 110 } },
  layers: [
    {
      ...{ id: 'name', type: 'text', in: 'block', text: slot('name'), font: F.heading },
      ...{ size: 6.4, minSize: 4, color: C.onPrimary, lines: 2, align: 'left' },
      ...{ plate: { color: C.primary, pad: 0.34 }, enter: on(0), exit: off },
    },
    {
      ...{ id: 'role', type: 'text', in: 'block', when: slot('role'), text: slot('role') },
      ...{ font: F.body, size: 3.1, minSize: 2.3, color: C.text, lines: 2, align: 'left' },
      ...{ upper: true, tracking: 0.06 },
      ...{ plate: { color: C.surface, pad: 0.6 }, enter: on(0.14), exit: off },
    },
  ],
  formats: {
    tall: {
      groups: { block: { y: -14, maxWidth: '100%' } },
      layers: { name: { size: 7.2 }, role: { size: 3.6 } },
    },
    square: { groups: { block: { y: -3, maxWidth: '100%' } } },
  },
});

export const title = element('title', {
  groups: { stack: { at: 'center', align: 'center', gap: 0, maxWidth: '88%' } },
  layers: [
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 12, minSize: 4.6, color: C.onPrimary, lines: 4 },
      ...{ plate: { color: C.primary, pad: 0.26 }, enter: on(0), exit: off },
    },
    {
      ...{ id: 'subtitle', type: 'text', in: 'stack', when: slot('subtitle') },
      ...{ text: slot('subtitle'), font: F.body, size: 3.8, minSize: 2.6, color: C.text },
      ...{ lines: 3, upper: true, tracking: 0.06 },
      ...{ plate: { color: C.surface, pad: 0.6 }, enter: on(0.16), exit: off },
    },
  ],
  formats: { tall: { layers: { subtitle: { size: 4.2 } } } },
});

export const caption = element('caption', {
  layers: [
    {
      ...{ id: 'text', type: 'text', at: 'bottom', text: slot('text'), font: F.body },
      ...{ size: 4.6, minSize: 3.2, color: C.text, lines: 3, maxWidth: '86%', align: 'center' },
      ...{ plate: { color: C.surface, pad: 0.4 } },
      ...{ enter: { motion: 'fade', duration: 0.1, by: 'block' } },
      ...{ exit: { motion: 'fade', duration: 0.1 } },
    },
  ],
  formats: { tall: { layers: { text: { y: -16, size: 5, maxWidth: '100%' } } } },
});

export const quote = element('quote', {
  groups: { stack: { at: 'center', align: 'left', gap: 2, pad: [4.5, 3.6], maxWidth: '84%' } },
  layers: [
    {
      ...{ id: 'slab', type: 'shape', around: 'stack', fill: C.primary },
      ...{ enter: on(0), exit: off },
    },
    {
      ...{ id: 'edge', type: 'shape', beside: 'slab', side: 'left', gap: 0, thickness: 1.6 },
      ...{ fill: C.surface, enter: on(0), exit: off },
    },
    {
      ...{ id: 'text', type: 'text', in: 'stack', text: slot('text'), font: F.heading },
      ...{ size: 8.5, minSize: 4.4, color: C.onPrimary, lines: 6, lineHeight: 1 },
      ...{ enter: { motion: 'slide-up', delay: 0.2, duration: 0.5, by: 'line' } },
      ...{ exit: { motion: 'fade', duration: 0.2 } },
    },
    {
      ...{ id: 'by', type: 'text', in: 'stack', when: slot('by'), text: slot('by') },
      ...{ font: F.body, size: 3.4, color: C.onPrimary, lines: 2, upper: true, tracking: 0.06 },
      ...{ enter: { motion: 'fade', delay: 0.6, duration: 0.3 } },
      ...{ exit: { motion: 'fade', duration: 0.2 } },
    },
  ],
});

export const bug = element('bug', {
  layers: mark({
    ...{ size: 7, place: { at: 'top-right' }, base: C.primary, ink: C.onPrimary },
    ...{ figure: 'bar' },
    ...{ enter: { motion: 'wipe', duration: 0.3 }, exit: { motion: 'fade', duration: 0.3 } },
  }),
});
