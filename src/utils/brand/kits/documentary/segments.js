/**
 * The built-in `documentary` kit, its segments and its transition: a warm
 * black ground, a serif set in the middle between two hairlines, a dip to
 * black across a cut. Pure data. Isomorphic.
 * @module utils/brand/kits/documentary/segments
 */

import { mark } from '#utils/brand/kits/mark.js';
import { C, F, T, element, slot } from '#utils/brand/kits/parts.js';

const leave = { motion: 'fade', duration: 0.6 };
const arrive = (/** @type {number} */ delay, duration = 0.8) => ({
  motion: T.enter,
  delay,
  duration,
});
const label = { font: F.body, upper: true, tracking: 0.18 };
const hairline = { type: 'shape', h: T.stroke, fill: C.primary };

/** The ground of every segment: a little light in the middle of the dark. */
const ground = {
  ...{ id: 'ground', type: 'generator', generator: 'gradient' },
  params: { kind: 'radial', stops: 2, color1: C.surface, color2: C.background, size: 0.95 },
  animate: { size: [0.85, 1.1] },
};
const seal = (/** @type {number} */ size, /** @type {Record<string, any>} */ place, delay = 0) =>
  mark({
    ...{ size, place, base: '', ink: C.primary, shape: 'ellipse', figure: 'dot' },
    ...{ stroke: C.primary, strokeWidth: 0.28, enter: arrive(delay), exit: leave },
  });

export const chapter = element('chapter', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.6, maxWidth: '78%' } },
  layers: [
    ground,
    {
      ...{ id: 'number', type: 'text', in: 'stack', when: slot('number'), text: slot('number') },
      ...{ ...label, size: 3.6, color: C.primary, lines: 1, enter: arrive(0), exit: leave },
    },
    { ...{ id: 'rule', ...hairline, in: 'stack', w: 7 }, enter: arrive(0.2), exit: leave },
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 12, minSize: 4.8, color: C.text, lines: 4, enter: arrive(0.4, 1), exit: leave },
    },
  ],
});

export const intro = element('intro', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.8, maxWidth: '80%' } },
  layers: [
    ground,
    ...seal(12, { in: 'stack' }),
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 12, minSize: 4.8, color: C.text, lines: 4, gap: 4 },
      ...{ enter: arrive(0.5, 1.1), exit: leave },
    },
    { ...{ id: 'rule', ...hairline, in: 'stack', w: 7 }, enter: arrive(1), exit: leave },
    {
      ...{ id: 'subtitle', type: 'text', in: 'stack', when: slot('subtitle') },
      ...{ text: slot('subtitle'), ...label, size: 3.4, color: C.muted, lines: 3 },
      ...{ enter: arrive(1.2), exit: leave },
    },
  ],
});

export const outro = element('outro', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.8, maxWidth: '80%' } },
  layers: [
    ground,
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ italic: true, size: 9, minSize: 4.4, color: C.text, lines: 4 },
      ...{ enter: arrive(0.1, 1), exit: leave },
    },
    { ...{ id: 'rule', ...hairline, in: 'stack', w: 7 }, enter: arrive(0.5), exit: leave },
    {
      ...{ id: 'text', type: 'text', in: 'stack', when: slot('text'), text: slot('text') },
      ...{ ...label, size: 3.4, color: C.muted, lines: 4, lineHeight: 1.5 },
      ...{ enter: arrive(0.8), exit: leave },
    },
    ...seal(7, { in: 'stack', gap: 5 }, 1),
  ],
});

export const stinger = element('stinger', {
  duration: 1.6,
  layers: [
    {
      ...{ id: 'dark', type: 'shape', around: 'frame', fill: C.background },
      ...{ enter: { motion: 'fade', duration: 0.6, ease: 'ease-in-out' } },
      ...{ exit: { motion: 'fade', duration: 0.6, ease: 'ease-in-out' } },
    },
    ...mark({
      ...{ size: 12, place: { at: 'center', inside: 'frame' }, base: '', stroke: C.primary },
      ...{ strokeWidth: 0.28, ink: C.primary, shape: 'ellipse', figure: 'dot' },
      ...{ enter: { motion: 'fade', delay: 0.3, duration: 0.35 } },
      ...{ exit: { motion: 'fade', delay: 0.3, duration: 0.35 } },
    }),
  ],
});
