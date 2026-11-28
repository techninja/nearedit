/**
 * The built-in `clean` kit, its overlays: quiet plates with a thin bar in
 * the brand colour, a sans-serif, text that rises in word by word.
 * Pure data. Isomorphic.
 * @module utils/brand/kits/clean/overlays
 */

import { mark } from '#utils/brand/kits/mark.js';
import { C, F, T, element, slot } from '#utils/brand/kits/parts.js';

const SOFT = { color: '#00000080', blur: 1.6, y: 0.3 };
const leave = { motion: T.exit, duration: 0.3 };

export const lowerThird = element('lower-third', {
  groups: { block: { at: 'bottom-left', align: 'left', gap: 0.5, pad: [2.8, 1.7], maxWidth: 82 } },
  layers: [
    {
      ...{ id: 'plate', type: 'shape', around: 'block', fill: C.surface, radius: T.radius },
      ...{ opacity: 0.92, enter: { motion: 'wipe', duration: 0.45 }, exit: leave },
    },
    {
      ...{ id: 'bar', type: 'shape', inside: 'plate', at: 'left', x: 1.15, w: 0.5, h: '58%' },
      ...{ fill: C.primary, radius: 0.25 },
      ...{ enter: { motion: 'scale', delay: 0.15, duration: 0.35 }, exit: leave },
    },
    {
      ...{ id: 'name', type: 'text', in: 'block', text: slot('name'), font: F.heading },
      ...{ size: 4.4, color: C.text, lines: 2 },
      ...{ enter: { motion: T.enter, delay: 0.2, duration: 0.5 }, exit: leave },
    },
    {
      ...{ id: 'role', type: 'text', in: 'block', when: slot('role'), text: slot('role') },
      ...{ font: F.body, size: 2.7, color: C.muted, lines: 2 },
      ...{ enter: { motion: 'fade', delay: 0.4, duration: 0.4 }, exit: leave },
    },
  ],
  formats: {
    tall: { groups: { block: { y: -14, maxWidth: '100%' } } },
    square: { groups: { block: { y: -3, maxWidth: '100%' } } },
  },
});

export const title = element('title', {
  groups: { stack: { at: 'center', align: 'center', gap: 1.6, maxWidth: '86%' } },
  layers: [
    {
      ...{ id: 'scrim', type: 'shape', around: 'frame', fill: C.background, opacity: 0.5 },
      ...{ enter: { motion: 'fade', duration: 0.5 }, exit: { motion: 'fade', duration: 0.4 } },
    },
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 9.5, minSize: 5, color: C.text, lines: 3, shadow: SOFT },
      ...{ enter: { motion: T.enter, delay: 0.1, duration: 0.7 }, exit: leave },
    },
    {
      ...{ id: 'rule', type: 'shape', in: 'stack', when: slot('subtitle'), w: 9, h: 0.5 },
      ...{ fill: C.primary, radius: 0.25, gap: 2.2 },
      ...{ enter: { motion: 'scale', delay: 0.45, duration: 0.4 }, exit: leave },
    },
    {
      ...{ id: 'subtitle', type: 'text', in: 'stack', when: slot('subtitle') },
      ...{ text: slot('subtitle'), font: F.body, size: 3.6, color: C.muted, lines: 3 },
      ...{ shadow: SOFT, gap: 2.2 },
      ...{ enter: { motion: 'fade', delay: 0.6, duration: 0.5 }, exit: leave },
    },
  ],
  formats: { tall: { layers: { title: { size: 10.5 }, subtitle: { size: 4.2 } } } },
});

export const caption = element('caption', {
  layers: [
    {
      ...{ id: 'text', type: 'text', at: 'bottom', text: slot('text'), font: F.body },
      ...{ weight: 700, size: 3.5, minSize: 2.6, color: C.text, lines: 3, maxWidth: '84%' },
      ...{ align: 'center', plate: { color: `${C.surface}e0`, pad: 0.42, radius: T.radius } },
      ...{ enter: { motion: 'fade', duration: 0.15, by: 'block' } },
      ...{ exit: { motion: 'fade', duration: 0.12 } },
    },
  ],
  formats: { tall: { layers: { text: { y: -16, size: 4.2, maxWidth: '100%' } } } },
});

export const quote = element('quote', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.4, maxWidth: '80%' } },
  layers: [
    {
      ...{ id: 'scrim', type: 'shape', around: 'frame', fill: C.background, opacity: 0.55 },
      ...{ enter: { motion: 'fade', duration: 0.5 }, exit: { motion: 'fade', duration: 0.4 } },
    },
    {
      ...{ id: 'open', type: 'text', in: 'stack', text: '“', font: F.heading, size: 16 },
      ...{ color: C.primary, lineHeight: 0.62, lines: 1 },
      ...{ enter: { motion: 'scale', duration: 0.4, by: 'block' }, exit: leave },
    },
    {
      ...{ id: 'text', type: 'text', in: 'stack', text: slot('text'), font: F.heading },
      ...{ weight: 400, size: 5.4, minSize: 3.2, color: C.text, lines: 6, lineHeight: 1.28 },
      ...{ shadow: SOFT, gap: 0.6 },
      ...{ enter: { motion: T.enter, delay: 0.15, duration: 0.9 }, exit: leave },
    },
    {
      ...{ id: 'by', type: 'text', in: 'stack', when: slot('by'), text: `— ${slot('by')}` },
      ...{ font: F.body, size: 3, color: C.muted, lines: 2, shadow: SOFT },
      ...{ enter: { motion: 'fade', delay: 0.9, duration: 0.5 }, exit: leave },
    },
  ],
});

export const bug = element('bug', {
  layers: mark({
    ...{ size: 7, place: { at: 'top-right', opacity: 0.9 }, base: C.primary, ink: C.onPrimary },
    ...{ radius: 1.6, figure: 'ring' },
    ...{ enter: { motion: 'fade', duration: 0.6 }, exit: { motion: 'fade', duration: 0.6 } },
  }),
});
