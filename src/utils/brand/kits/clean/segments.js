/**
 * The built-in `clean` kit, its segments and its transition: a deep, slowly
 * moving ground, the mark, centred type; a panel in the brand colour that
 * slides across a cut. Pure data. Isomorphic.
 * @module utils/brand/kits/clean/segments
 */

import { mark } from '#utils/brand/kits/mark.js';
import { C, F, T, element, slot } from '#utils/brand/kits/parts.js';

const leave = { motion: 'fade', duration: 0.4 };

/** The ground of every segment: a soft light on the background colour. */
const ground = {
  ...{ id: 'ground', type: 'generator', generator: 'gradient' },
  params: { kind: 'radial', stops: 2, color1: C.surface, color2: C.background, size: 1.1 },
  animate: { 'center.x': [0.42, 0.58], 'center.y': [0.44, 0.52] },
};

export const chapter = element('chapter', {
  groups: { stack: { at: 'left', align: 'left', gap: 2.2, maxWidth: '78%', x: 4 } },
  layers: [
    ground,
    {
      ...{ id: 'number', type: 'text', in: 'stack', when: slot('number'), text: slot('number') },
      ...{ font: F.heading, size: 4.2, color: C.primary, tracking: 0.12, upper: true, lines: 1 },
      ...{ enter: { motion: 'fade', delay: 0.1, duration: 0.4 }, exit: leave },
    },
    {
      ...{ id: 'rule', type: 'shape', in: 'stack', w: 10, h: 0.5, fill: C.primary, radius: 0.25 },
      ...{ enter: { motion: 'wipe', delay: 0.15, duration: 0.4 }, exit: leave },
    },
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 11, minSize: 5.5, color: C.text, lines: 3 },
      ...{ enter: { motion: T.enter, delay: 0.25, duration: 0.7 }, exit: leave },
    },
  ],
  formats: { tall: { groups: { stack: { x: 0, maxWidth: '100%' } } } },
});

export const intro = element('intro', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.6, maxWidth: '84%' } },
  layers: [
    ground,
    ...mark({
      ...{ size: 15, place: { in: 'stack' }, base: C.primary, ink: C.onPrimary, radius: 3.4 },
      ...{ enter: { motion: 'scale', duration: 0.5, ease: 'back-out' }, exit: leave },
    }),
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 10, minSize: 5, color: C.text, lines: 3, gap: 4 },
      ...{ enter: { motion: T.enter, delay: 0.35, duration: 0.7 }, exit: leave },
    },
    {
      ...{ id: 'subtitle', type: 'text', in: 'stack', when: slot('subtitle') },
      ...{ text: slot('subtitle'), font: F.body, size: 3.8, color: C.muted, lines: 3 },
      ...{ enter: { motion: 'fade', delay: 0.8, duration: 0.5 }, exit: leave },
    },
  ],
});

export const outro = element('outro', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.4, maxWidth: '84%' } },
  layers: [
    ground,
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 8.5, minSize: 4.5, color: C.text, lines: 3 },
      ...{ enter: { motion: T.enter, delay: 0.1, duration: 0.7 }, exit: leave },
    },
    {
      ...{ id: 'text', type: 'text', in: 'stack', when: slot('text'), text: slot('text') },
      ...{ font: F.body, size: 3.8, color: C.muted, lines: 4 },
      ...{ enter: { motion: 'fade', delay: 0.5, duration: 0.5 }, exit: leave },
    },
    ...mark({
      ...{ size: 9, place: { in: 'stack', gap: 5 }, base: C.primary, ink: C.onPrimary },
      ...{ radius: 2, enter: { motion: 'scale', delay: 0.7, duration: 0.45, ease: 'back-out' } },
      exit: leave,
    }),
  ],
});

export const stinger = element('stinger', {
  layers: [
    {
      ...{ id: 'panel', type: 'shape', around: 'frame', fill: C.primary },
      ...{ enter: { motion: 'slide-right', travel: 'out', duration: 0.45, ease: 'ease-in-out' } },
      ...{ exit: { motion: 'slide-right', travel: 'out', duration: 0.45, ease: 'ease-in-out' } },
    },
    ...mark({
      ...{ size: 16, place: { at: 'center', inside: 'frame' }, base: C.onPrimary },
      ...{ ink: C.primary, radius: 3.6 },
      ...{ enter: { motion: 'scale', delay: 0.25, duration: 0.3, ease: 'back-out' } },
      ...{ exit: { motion: 'scale', delay: 0.25, duration: 0.25 } },
    }),
  ],
});
