/**
 * The title card of a site demo: a title, and a subtitle if there is one,
 * before the recording — one scene built by the motion piece's own builder
 * (DIRECTOR-MOTION.md), in the demo's theme. Only its words are taken: the
 * demo's own background runs on underneath.
 * @module api/director/web/card
 */

import { MAX_SUBTITLE, MAX_TITLE } from '#utils/director/motion/planSchema.js';
import { tidyText } from '../motion/brief.js';
import { buildMotion } from '../motion/build.js';
import { completePlan } from '../motion/complete.js';

/**
 * @typedef {Object} Card
 * @property {any[]} titles - Clips for the `Titles` row
 * @property {any[]} text - Clips for the `Text` row
 * @property {number} frames - How long the card lasts; 0 for no card
 * @property {string[]} notes
 */

/**
 * @param {string} title - '' for no card
 * @param {string} subtitle
 * @param {{ theme: string, format: { fps: number, width: number, height: number },
 *   pacing: string, seed: number }} options
 * @returns {Card}
 */
export function titleCard(title, subtitle, { theme, format, pacing, seed }) {
  const words = tidyText(title, MAX_TITLE);
  if (!words) return { titles: [], text: [], frames: 0, notes: [] };
  const scene = {
    title: words,
    particles: 'none',
    accent: 'none',
    look: 'none',
    transition: 'fade',
  };
  const second = tidyText(subtitle, MAX_SUBTITLE);
  const { plan } = completePlan(
    { align: 'center', scenes: [second ? { ...scene, subtitle: second } : scene] },
    { theme, seed, particles: 'none' },
  );
  const built = buildMotion(plan, { format, seed, pacing, duration: 0 });
  const row = (/** @type {string} */ name) => built.tracks.find((t) => t.name === name).clips;
  return {
    titles: row('Titles'),
    text: row('Text'),
    frames: Math.round(built.seconds * format.fps),
    notes: built.notes,
  };
}
