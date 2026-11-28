/**
 * Test helpers for the element language: frames, a small lower third, and
 * expanding a design into clips by layer id. Not part of the runtime API —
 * import it from tests.
 * @module utils/brand/element/testkit
 */

import { expandElement } from './expand.js';
import { normalizeDesign } from './normalize.js';

export const WIDE = { width: 1920, height: 1080 };
export const TALL = { width: 1080, height: 1920 };
export const SQUARE = { width: 1080, height: 1080 };
export const FONT = { family: 'Inter', weight: 700 };
export const design = (body) =>
  normalizeDesign({ kind: 'overlay', margin: 6, slots: ['name', 'role'], ...body });
/** The clips of a design, by layer id. */
export function expand(body, slots = {}, opts = {}) {
  const warnings = [];
  const clips = expandElement(design(body), slots, {
    ...{ duration: 5, frame: WIDE, warn: (message) => warnings.push(message) },
    ...opts,
  });
  return {
    clips,
    warnings,
    by: Object.fromEntries(clips.map((clip) => [clip.clipId.slice(3), clip])),
  };
}
/** The box of a shape layer's clip, output pixels. */
export function boxOf(clip, frame = WIDE) {
  const { position, widthPx, heightPx } = clip.generator.params;
  const [cx, cy] = [position.x * frame.width, position.y * frame.height];
  return {
    x: cx - widthPx / 2,
    y: cy - heightPx / 2,
    w: widthPx,
    h: heightPx,
    right: cx + widthPx / 2,
    bottom: cy + heightPx / 2,
  };
}
export const square = (id, more) => ({ id, type: 'shape', w: 10, h: 10, fill: '#ff0000', ...more });
export const LOWER = {
  groups: { block: { at: 'bottom-left', align: 'left', gap: 1, pad: [3, 2] } },
  layers: [
    { id: 'plate', type: 'shape', around: 'block', fill: '#000000' },
    {
      id: 'bar',
      type: 'shape',
      beside: 'plate',
      side: 'left',
      gap: 1,
      thickness: 0.5,
      fill: '#ff0000',
    },
    { id: 'name', type: 'text', in: 'block', text: '{slot.name}', font: FONT, size: 5 },
    {
      id: 'role',
      type: 'text',
      in: 'block',
      when: '{slot.role}',
      text: '{slot.role}',
      font: FONT,
      size: 3,
    },
  ],
  formats: {
    tall: { groups: { block: { y: -10 } }, layers: { name: { size: 7 }, bar: { when: false } } },
  },
};
