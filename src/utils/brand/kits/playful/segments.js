/**
 * The built-in `playful` kit, its segments and its transition: a warm
 * paper ground strewn with dots, a big round mark, handwriting; two
 * circles that swallow the frame across a cut. Pure data. Isomorphic.
 * @module utils/brand/kits/playful/segments
 */

import { mark } from '#utils/brand/kits/mark.js';
import { C, F, T, element, slot } from '#utils/brand/kits/parts.js';

const pop = (/** @type {number} */ delay, duration = 0.45) => ({
  ...{ motion: 'scale', delay, duration, ease: 'back-out' },
});
const leave = { motion: 'scale', duration: 0.3, ease: 'back-in' };
const gone = { motion: 'fade', duration: 0.25 };
const letters = (/** @type {number} */ delay, duration = 0.7) => ({
  ...{ motion: T.enter, delay, duration, ease: 'back-out' },
});

/** The ground of every segment: paper, with dots drifting across it. */
const ground = [
  { id: 'paper', type: 'shape', around: 'frame', fill: C.background },
  {
    ...{ id: 'dots', type: 'generator', generator: 'pattern' },
    params: {
      ...{ pattern: 'dots', color: `${C.primary}29`, background: `${C.background}00` },
      fill: 0.34,
    },
    ...{ lengths: { size: 7, speedX: 1.2, speedY: -0.6 } },
  },
];
const badge = (/** @type {number} */ size, /** @type {Record<string, any>} */ place, delay = 0) =>
  mark({
    ...{ size, place, base: C.primary, ink: C.onPrimary, shape: 'ellipse', figure: 'star' },
    ...{ stroke: C.text, strokeWidth: 0.45, enter: pop(delay), exit: leave },
  });

export const chapter = element('chapter', {
  groups: { stack: { at: 'center', align: 'center', gap: 3, maxWidth: '82%' } },
  layers: [
    ...ground,
    {
      ...{ id: 'ball', type: 'shape', shape: 'ellipse', in: 'stack', when: slot('number') },
      ...{ w: 17, h: 17, fill: C.accent, stroke: C.text, strokeWidth: 0.45 },
      ...{ enter: pop(0), exit: leave },
    },
    {
      ...{ id: 'number', type: 'text', inside: 'ball', at: 'center', when: slot('number') },
      ...{ text: slot('number'), font: F.heading, size: 7.4, color: C.onAccent, lines: 1 },
      ...{ lineHeight: 1, maxWidth: 14 },
      ...{ enter: { motion: 'scale', delay: 0.15, duration: 0.3, by: 'block' }, exit: gone },
    },
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 8.4, minSize: 4, color: C.text, lines: 4, lineHeight: 1 },
      ...{ enter: letters(0.25), exit: gone },
    },
  ],
});

export const intro = element('intro', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.4, maxWidth: '84%' } },
  layers: [
    ...ground,
    ...badge(16, { in: 'stack' }),
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 9, minSize: 4.2, color: C.text, lines: 4, lineHeight: 1, gap: 3.4 },
      ...{ enter: letters(0.3, 0.8), exit: gone },
    },
    {
      ...{ id: 'subtitle', type: 'text', in: 'stack', when: slot('subtitle') },
      ...{ text: slot('subtitle'), font: F.body, size: 3.6, color: C.onPrimary, lines: 3 },
      ...{ plate: { color: C.primary, pad: 0.55, radius: 6 } },
      ...{ enter: { motion: 'scale', delay: 0.9, duration: 0.35, ease: 'back-out', by: 'block' } },
      exit: gone,
    },
  ],
});

export const outro = element('outro', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.4, maxWidth: '84%' } },
  layers: [
    ...ground,
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 8.4, minSize: 4, color: C.text, lines: 4, lineHeight: 1 },
      ...{ enter: letters(0.1, 0.8), exit: gone },
    },
    {
      ...{ id: 'text', type: 'text', in: 'stack', when: slot('text'), text: slot('text') },
      ...{ font: F.body, size: 3.6, color: C.onPrimary, lines: 4 },
      ...{ plate: { color: C.primary, pad: 0.55, radius: 6 } },
      ...{ enter: { motion: 'scale', delay: 0.6, duration: 0.35, ease: 'back-out', by: 'block' } },
      exit: gone,
    },
    ...badge(10, { in: 'stack', gap: 4 }, 0.8),
  ],
});

/** A circle that grows from the middle until it holds the whole frame. */
const swallow = (
  /** @type {string} */ id,
  /** @type {string} */ fill,
  /** @type {number} */ late,
) => ({
  ...{ id, type: 'shape', shape: 'ellipse', inside: 'frame', at: 'center', w: 215, h: 215, fill },
  enter: { motion: 'scale', delay: late, duration: 0.42, ease: 'ease-in' },
  exit: { motion: 'scale', delay: late, duration: 0.42, ease: 'ease-out' },
});

export const stinger = element('stinger', {
  layers: [
    swallow('first', C.primary, 0),
    swallow('second', C.accent, 0.12),
    ...mark({
      ...{ size: 20, place: { at: 'center', inside: 'frame' }, base: C.surface, ink: C.primary },
      ...{ shape: 'ellipse', figure: 'star', stroke: C.text, strokeWidth: 0.5 },
      ...{ enter: { motion: 'scale', delay: 0.38, duration: 0.25, ease: 'back-out' } },
      ...{ exit: { motion: 'scale', delay: 0.42, duration: 0.2, ease: 'back-in' } },
    }),
  ],
});
