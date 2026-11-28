/**
 * The built-in `bold` kit, its segments and its transition: black grounds,
 * a band of the brand colour across the frame, huge capitals; two panels
 * that chase each other across a cut. Pure data. Isomorphic.
 * @module utils/brand/kits/bold/segments
 */

import { mark } from '#utils/brand/kits/mark.js';
import { C, F, element, slot } from '#utils/brand/kits/parts.js';

const off = { motion: 'fade', duration: 0.25 };
const ground = { id: 'ground', type: 'shape', around: 'frame', fill: C.background };
/** A band of colour across the whole frame, as tall as what it holds. */
const band = (/** @type {string} */ around) => ({
  ...{ id: 'band', type: 'shape', around, pad: [200, 3], fill: C.primary },
  ...{ enter: { motion: 'wipe', duration: 0.35 }, exit: off },
});
const small = { font: F.body, upper: true, tracking: 0.08 };

export const chapter = element('chapter', {
  groups: { stack: { at: 'left', align: 'left', gap: 0.5, maxWidth: '84%' } },
  layers: [
    { ...ground, fill: C.primary },
    {
      ...{ id: 'strip', type: 'shape', inside: 'frame', at: 'bottom', w: '100%', h: 3.4 },
      ...{ fill: C.surface, enter: { motion: 'wipe', duration: 0.4 }, exit: off },
    },
    {
      ...{ id: 'number', type: 'text', in: 'stack', when: slot('number'), text: slot('number') },
      ...{ font: F.heading, size: 22, color: C.onPrimary, lines: 1, lineHeight: 0.94 },
      ...{ enter: { motion: 'slide-right', duration: 0.35, by: 'block' }, exit: off },
    },
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 11, minSize: 5, color: C.onPrimary, lines: 4, lineHeight: 0.98 },
      ...{ enter: { motion: 'slide-up', delay: 0.15, duration: 0.45, by: 'line' }, exit: off },
    },
  ],
});

export const intro = element('intro', {
  groups: { stack: { at: 'center', align: 'center', gap: 5.6, maxWidth: '88%' } },
  layers: [
    ground,
    band('title'),
    ...mark({
      ...{ size: 9, place: { in: 'stack' }, base: C.primary, ink: C.onPrimary, figure: 'bar' },
      ...{ enter: { motion: 'scale', delay: 0.3, duration: 0.3, ease: 'back-out' }, exit: off },
    }),
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 15, minSize: 6, color: C.onPrimary, lines: 4, lineHeight: 0.98 },
      ...{ enter: { motion: 'slide-up', delay: 0.15, duration: 0.5, by: 'word' }, exit: off },
    },
    {
      ...{ id: 'subtitle', type: 'text', in: 'stack', when: slot('subtitle') },
      ...{ text: slot('subtitle'), ...small, size: 3.8, color: C.text, lines: 2 },
      ...{ enter: { motion: 'fade', delay: 0.55, duration: 0.3 }, exit: off },
    },
  ],
});

export const outro = element('outro', {
  groups: { stack: { at: 'center', align: 'center', gap: 2.4, maxWidth: '86%' } },
  layers: [
    ground,
    {
      ...{ id: 'title', type: 'text', in: 'stack', text: slot('title'), font: F.heading },
      ...{ size: 13, minSize: 5.5, color: C.text, lines: 4, lineHeight: 0.98 },
      ...{ enter: { motion: 'slide-up', duration: 0.5, by: 'word' }, exit: off },
    },
    {
      ...{ id: 'rule', type: 'shape', in: 'stack', w: 18, h: 1.2, fill: C.primary },
      ...{ enter: { motion: 'wipe', delay: 0.25, duration: 0.3 }, exit: off },
    },
    {
      ...{ id: 'text', type: 'text', in: 'stack', when: slot('text'), text: slot('text') },
      ...{ ...small, size: 3.8, color: C.muted, lines: 4 },
      ...{ enter: { motion: 'fade', delay: 0.45, duration: 0.3 }, exit: off },
    },
    ...mark({
      ...{ size: 8, place: { in: 'stack', gap: 5 }, base: C.primary, ink: C.onPrimary },
      ...{ figure: 'bar' },
      ...{ enter: { motion: 'scale', delay: 0.5, duration: 0.3, ease: 'back-out' }, exit: off },
    }),
  ],
});

/**
 * A panel that crosses the frame from the left and leaves by the right. The
 * one that arrives last leaves first, so the first is seen again on the way out.
 */
const panel = (
  /** @type {string} */ id,
  /** @type {string} */ fill,
  /** @type {number} */ late,
) => ({
  ...{ id, type: 'shape', around: 'frame', fill },
  enter: { motion: 'slide-right', travel: 'out', delay: late, duration: 0.36, ease: 'ease-in' },
  exit: { motion: 'slide-right', travel: 'out', delay: late, duration: 0.36, ease: 'ease-out' },
});

export const stinger = element('stinger', {
  layers: [
    panel('first', C.primary, 0),
    panel('second', C.surface, 0.12),
    ...mark({
      ...{ size: 18, place: { at: 'center', inside: 'frame' }, base: C.primary },
      ...{ ink: C.onPrimary, figure: 'bar' },
      ...{ enter: { motion: 'scale', delay: 0.36, duration: 0.2, ease: 'back-out' } },
      ...{ exit: { motion: 'scale', delay: 0.4, duration: 0.15 } },
    }),
  ],
});
