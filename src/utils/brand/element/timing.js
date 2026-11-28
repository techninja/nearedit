/**
 * Timing — when each layer of an element arrives and leaves. An entrance
 * is timed from the element's start (`delay` seconds in, lasting
 * `duration`), an exit from its end (finished `delay` seconds before it),
 * so an element held for two seconds or for twenty arrives and leaves the
 * same way. The kit's `speed` divides every time; an element too short for
 * its motions has them shortened in proportion.
 * Isomorphic and pure. Contract: docs/app-spec/BRAND.md § Elements.
 * @module utils/brand/element/timing
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { EASINGS } from '#utils/edl/easing.js';
import { TEXT_UNITS } from '#utils/edl/defaults.js';
import { num } from './measure.js';
import { MOTIONS, MOTION_SECONDS } from './vocabulary.js';

/**
 * One motion of one layer, in seconds from the element's start.
 * @typedef {Object} Move
 * @property {string} motion - One of `MOTIONS`, never `none`
 * @property {number} from - When it begins
 * @property {number} to - When it is over
 * @property {string} by - Text: the unit that moves (`block`, `line`, `word`, `char`)
 * @property {string} ease
 * @property {number|undefined} stagger - Text: seconds between units, when the design says
 * @property {number|'out'|undefined} travel - Slides: units, or `out` for from outside the frame
 * @property {number|undefined} angle - Wipes: degrees
 */

/**
 * @typedef {Object} Timing
 * @property {number} start - The layer is there from here…
 * @property {number} end - …to here
 * @property {Move|null} enter
 * @property {Move|null} exit
 */

/** Shortest a layer may be for it to be drawn at all, seconds. */
const SHORTEST = 1e-3;

/**
 * A motion as a design writes it — a name, or an object — with every field usable.
 * @param {any} value
 * @param {'enter'|'exit'} edge
 * @param {{ by: string, ease: string, speed: number }} kit
 * @returns {{ motion: string, delay: number, duration: number, by: string, ease: string,
 *   stagger: number|undefined, travel: any, angle: number|undefined }}
 */
function written(value, edge, kit) {
  const raw = typeof value === 'string' ? { motion: value } : isPlainObject(value) ? value : {};
  const motion = MOTIONS.includes(raw.motion) ? raw.motion : 'none';
  const fallback = edge === 'exit' && !EASINGS.includes(raw.ease) ? 'ease-in' : kit.ease;
  return {
    motion,
    delay: num(raw.delay, 0, 0, 600) / kit.speed,
    duration: motion === 'none' ? 0 : num(raw.duration, MOTION_SECONDS[edge], 0, 600) / kit.speed,
    by: TEXT_UNITS.includes(raw.by) ? raw.by : edge === 'enter' ? kit.by : 'block',
    ease: EASINGS.includes(raw.ease) ? raw.ease : fallback,
    stagger: Number.isFinite(raw.stagger) ? Math.max(0, raw.stagger) / kit.speed : undefined,
    travel: raw.travel,
    angle: Number.isFinite(raw.angle) ? raw.angle : undefined,
  };
}

/**
 * When every layer of a view arrives and leaves.
 * @param {import('./view.js').View} view
 * @param {number} duration - Seconds the element lasts
 * @returns {Map<string, Timing|null>} By layer id; null for a layer that
 *   has no time left to show in
 */
export function timings(view, duration) {
  const specs = view.layers.map((layer) => ({
    id: layer.id,
    enter: written(layer.enter, 'enter', view.motion),
    exit: written(layer.exit, 'exit', view.motion),
  }));
  const arriving = Math.max(0, ...specs.map(({ enter }) => enter.delay + enter.duration));
  const leaving = Math.max(0, ...specs.map(({ exit }) => exit.delay + exit.duration));
  // Too short for both: every time shrinks by the same factor.
  const k = arriving + leaving > duration ? duration / (arriving + leaving) : 1;
  /** @type {Map<string, Timing|null>} */
  const out = new Map();
  for (const { id, enter, exit } of specs) {
    const start = enter.delay * k;
    const end = duration - exit.delay * k;
    /** @type {(spec: any, from: number, to: number) => Move|null} */
    const move = (spec, from, to) => {
      if (spec.motion === 'none' || !(to - from > 0)) return null;
      const { motion, by, ease, stagger, travel, angle } = spec;
      return { motion, from, to, by, ease, stagger, travel, angle };
    };
    out.set(
      id,
      end - start > SHORTEST
        ? {
            start,
            end,
            enter: move(enter, start, start + enter.duration * k),
            exit: move(exit, end - exit.duration * k, end),
          }
        : null,
    );
  }
  return out;
}
