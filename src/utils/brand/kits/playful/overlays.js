/**
 * The built-in `playful` kit, its overlays: handwriting on white pills and
 * cards, round corners, a dot of pink, everything popping in letter by
 * letter. Pure data. Isomorphic.
 * @module utils/brand/kits/playful/overlays
 */

import { mark } from '#utils/brand/kits/mark.js';
import { C, F, T, element, slot } from '#utils/brand/kits/parts.js';

const pop = (/** @type {number} */ delay, duration = 0.4) => ({
  ...{ motion: 'scale', delay, duration, ease: 'back-out' },
});
const leave = { motion: 'scale', duration: 0.25, ease: 'back-in' };
/** Words simply fade: a shape may shrink away, text that swells before it goes collides. */
const gone = { motion: 'fade', duration: 0.2 };
const letters = (/** @type {number} */ delay, duration = 0.6) => ({
  ...{ motion: T.enter, delay, duration, ease: 'back-out' },
});
/** White letters with a dark edge and a pink drop: a sticker that reads on anything. */
const sticker = {
  ...{ color: C.surface, outline: { color: C.text, width: 0.5 } },
  shadow: { color: C.primary, blur: 0, x: 0.45, y: 0.55 },
};

export const lowerThird = element('lower-third', {
  groups: { block: { at: 'bottom-left', align: 'left', gap: 0.1, pad: [5.2, 1.7], maxWidth: 100 } },
  layers: [
    {
      ...{ id: 'pill', type: 'shape', around: 'block', fill: C.surface, radius: 6 },
      ...{ stroke: C.text, strokeWidth: 0.4, enter: pop(0), exit: leave },
    },
    {
      ...{ id: 'dot', type: 'shape', shape: 'ellipse', inside: 'pill', at: 'left', x: 1.7 },
      ...{ w: 2.2, h: 2.2, fill: C.primary, enter: pop(0.2, 0.3), exit: leave },
    },
    {
      ...{ id: 'name', type: 'text', in: 'block', text: slot('name'), font: F.heading },
      ...{ size: 5, minSize: 3, color: C.text, lines: 2 },
      ...{ enter: letters(0.15), exit: gone },
    },
    {
      ...{ id: 'role', type: 'text', in: 'block', when: slot('role'), text: slot('role') },
      ...{ font: F.body, size: 3, minSize: 2.3, color: C.muted, lines: 2 },
      ...{ enter: { motion: 'fade', delay: 0.45, duration: 0.3 }, exit: gone },
    },
  ],
  formats: {
    tall: {
      groups: { block: { y: -14, maxWidth: '100%' } },
      layers: { name: { size: 5.8 }, role: { size: 3.5 } },
    },
    square: { groups: { block: { y: -3, maxWidth: '100%' } } },
  },
});

export const title = element('title', {
  groups: { stack: { at: 'center', align: 'center', gap: 2, maxWidth: '86%' } },
  layers: [
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 9.5, minSize: 4.4, lines: 4, ...sticker },
      ...{ enter: letters(0, 0.8), exit: gone },
    },
    {
      ...{ id: 'subtitle', type: 'text', in: 'stack', when: slot('subtitle') },
      ...{ text: slot('subtitle'), font: F.body, size: 3.6, minSize: 2.6, color: C.onPrimary },
      ...{ lines: 3, plate: { color: C.primary, pad: 0.55, radius: 6 } },
      ...{ enter: { motion: 'scale', delay: 0.5, duration: 0.35, ease: 'back-out', by: 'block' } },
      exit: gone,
    },
  ],
});

export const caption = element('caption', {
  layers: [
    {
      ...{ id: 'text', type: 'text', at: 'bottom', text: slot('text'), font: F.body },
      ...{ size: 4.2, minSize: 3, color: C.text, lines: 3, maxWidth: '82%', align: 'center' },
      ...{ plate: { color: C.surface, pad: 0.55, radius: 3 } },
      ...{ enter: { motion: 'scale', duration: 0.18, ease: 'back-out', by: 'block' } },
      ...{ exit: { motion: 'fade', duration: 0.12 } },
    },
  ],
  formats: { tall: { layers: { text: { y: -16, size: 4.8, maxWidth: '100%' } } } },
});

export const quote = element('quote', {
  groups: { stack: { at: 'center', align: 'center', gap: 1.6, pad: [5, 4], maxWidth: '82%' } },
  layers: [
    {
      ...{ id: 'card', type: 'shape', around: 'stack', fill: C.surface, radius: 4 },
      ...{ stroke: C.text, strokeWidth: 0.4, enter: pop(0, 0.45), exit: leave },
    },
    {
      ...{ id: 'badge', type: 'shape', shape: 'ellipse', beside: 'card', side: 'top', gap: -3 },
      ...{ w: 9, h: 9, fill: C.primary, stroke: C.text, strokeWidth: 0.4 },
      ...{ enter: pop(0.2, 0.35), exit: leave },
    },
    {
      ...{ id: 'open', type: 'text', inside: 'badge', at: 'center', y: 1.2, text: '“' },
      ...{ font: F.heading, size: 6.4, color: C.onPrimary, lines: 1, lineHeight: 0.8 },
      ...{ enter: { motion: 'scale', delay: 0.25, duration: 0.3, by: 'block' }, exit: gone },
    },
    {
      ...{ id: 'text', type: 'text', in: 'stack', text: slot('text'), font: F.heading },
      ...{ size: 5.6, minSize: 3.2, color: C.text, lines: 6, lineHeight: 1.05, gap: 3 },
      ...{ enter: letters(0.3, 0.9), exit: gone },
    },
    {
      ...{ id: 'by', type: 'text', in: 'stack', when: slot('by'), text: slot('by') },
      ...{ font: F.body, size: 3.4, color: C.primary, lines: 2 },
      ...{ enter: { motion: 'fade', delay: 1, duration: 0.3 }, exit: gone },
    },
  ],
});

export const bug = element('bug', {
  layers: mark({
    ...{ size: 7.5, place: { at: 'top-right' }, base: C.primary, ink: C.onPrimary },
    ...{ shape: 'ellipse', figure: 'star', stroke: C.text, strokeWidth: 0.35 },
    ...{ enter: pop(0, 0.45), exit: { motion: 'scale', duration: 0.3, ease: 'back-in' } },
  }),
});
