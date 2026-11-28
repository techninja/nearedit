/**
 * Reference documents: brand elements. Every standard element of every
 * built-in kit in the middle of its entrance, at rest and in the middle of
 * its exit; `elementSpecials.js` adds what an element does that nothing
 * else does.
 * @module tests/compose/cases/elements
 */

import {
  BUILTIN_KITS,
  STANDARD_ELEMENTS,
  builtinKit,
  kitKey,
  resolveElement,
  resolveKit,
} from '#utils/brand/index.js';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { gen } from '../build.js';
import { specialCases } from './elementSpecials.js';

/** @typedef {import('./index.js').Case} Case */

export const SLOTS = {
  ...{ name: 'Ada Lovelace', role: 'Mathematician', title: 'The Analytical Engine' },
  ...{ subtitle: 'A short history', text: 'The more I study, the more insatiable I feel.' },
  ...{ by: 'Ada Lovelace', number: '01' },
};
const SIZES = {
  wide: { resolution: '1920x1080', size: { width: 640, height: 360 } },
  tall: { resolution: '1080x1920', size: { width: 360, height: 640 } },
  square: { resolution: '1080x1080', size: { width: 360, height: 360 } },
};
/** The moments an element is drawn at: fractions of its entrance and of its exit. */
const MOMENTS = { in: 0.22, out: 0.14 };

/**
 * A document with one element clip over a bright, uneven picture.
 * @param {import('#utils/brand/types.js').Kit} kit - An effective kit
 * @param {string} id - The element
 * @param {Record<string, string>} slots
 * @param {{ format?: keyof typeof SIZES, fonts?: any[] }} [opts]
 * @returns {{ edl: any, length: number, size: { width: number, height: number } }}
 */
export function scene(kit, id, slots, opts = {}) {
  const design = resolveElement(kit, id);
  const length = design.duration;
  const span = { timelineStart: 0, timelineEnd: length, sourceOut: length };
  const element = { kit: { id: kit.id, key: kitKey(kit) }, id, slots, design };
  const { resolution, size } = SIZES[opts.format || 'wide'];
  const backdrop = gen(
    'bg',
    'gradient',
    { angle: 35, color1: '#f8fafc', color2: '#0ea5e9' },
    { timelineEnd: length, sourceOut: length },
  );
  const edl = createEdl({
    resolution,
    tracks: [
      createTrack('video', {
        trackId: 'v1',
        clips: [createClip({ clipId: 'el', ...span, element })],
      }),
      createTrack('video', { trackId: 'v2', clips: [backdrop] }),
      createTrack('audio', { trackId: 'a1' }),
    ],
    ...(opts.fonts && { fonts: opts.fonts }),
  });
  return { edl, length, size };
}

/**
 * @param {string} name
 * @param {ReturnType<typeof scene>} made
 * @param {'in'|'rest'|'out'} moment
 * @returns {Case}
 */
export function at(name, { edl, length, size }, moment) {
  const time = moment === 'rest' ? length / 2 : moment === 'in' ? MOMENTS.in : length - MOMENTS.out;
  return { name, edl, time, text: true, footage: {}, size };
}

/**
 * @param {{ logo: string, font: string }} files - Fixture files
 * @returns {Case[]}
 */
export function elementCases(files) {
  /** @type {Case[]} */
  const cases = [];
  const kits = BUILTIN_KITS.map(({ id }) => resolveKit(builtinKit(id)));
  for (const kit of kits) {
    for (const id of STANDARD_ELEMENTS) {
      const made = scene(kit, id, SLOTS);
      for (const moment of /** @type {const} */ (['in', 'rest', 'out'])) {
        cases.push(at(`element-${kit.id}-${id}-${moment}`, made, moment));
      }
    }
  }
  return [...cases, ...specialCases(kits, files)];
}
