/**
 * Motion plan → fragment. Deterministic: the plan says what each scene
 * shows; this code decides every time, size, position, colour and
 * keyframe, in whole frames of the target frame rate and for the target
 * resolution. Reference: docs/app-spec/DIRECTOR-MOTION.md § Building.
 * @module api/director/motion/build
 */

import { seedOf } from '#utils/compose/random.js';
import { getTheme, THEMES } from '#utils/director/motion/themes.js';
import { newId } from '#utils/edl/factory.js';
import { serverMeasure } from './measure.js';
import { particleClips } from './particles.js';
import { sceneClips } from './scene.js';
import { schedule } from './shots.js';

/** The rows of a motion fragment, front to back (video track 0 is in front). */
export const ROWS = ['Titles', 'Text', 'Accents', 'Particles', 'Background A', 'Background B'];

/**
 * @typedef {Object} BuildOptions
 * @property {{ fps: number, width: number, height: number }} format
 * @property {number|string} seed - Varies colours, directions and moves
 * @property {string} pacing - slow | medium | fast
 * @property {number} [duration] - Target length in seconds; 0 = what the scenes ask for
 * @property {import('./measure.js').Measure} [measure] - Text measurement; the
 *   server canvas by default
 * @typedef {Object} Built
 * @property {{ type: string, index: number, name: string, clips: any[] }[]} tracks
 * @property {object[]} markers - One per scene, times from the fragment's start
 * @property {string[]} notes
 * @property {number} seconds - Length of the fragment
 * @property {import('./shots.js').Shot[]} shots - The schedule that was built
 */

/**
 * Build the fragment of a complete motion plan.
 * @param {{ theme: string, align: 'center'|'left', scenes: any[] }} plan - Every
 *   choice made (`completePlan`)
 * @param {BuildOptions} options
 * @returns {Built}
 */
export function buildMotion(plan, options) {
  const { format } = options;
  const { fps } = format;
  const seed = seedOf(options.seed);
  const { shots, totalF, notes } = schedule(plan.scenes, {
    fps,
    pacing: options.pacing,
    target: options.duration || 0,
  });
  const piece = {
    plan,
    theme: getTheme(plan.theme) || THEMES[0],
    format,
    seed,
    measure: options.measure || serverMeasure(),
  };
  /** @type {Record<string, any[]>} */
  const rows = Object.fromEntries(ROWS.map((name) => [name, []]));
  shots.forEach((shot, i) => {
    const built = sceneClips(shot, shots[i + 1], piece);
    for (const [name, clip] of Object.entries(built.rows)) rows[name].push(clip);
    if (!built.fits) {
      notes.push(
        `Scene ${i + 1}: the text is too long to fit the frame at a readable size — ` +
          'shorten it or split it over two scenes.',
      );
    }
  });
  rows.Particles = particleClips(
    shots.map((shot) => ({ ...shot, particles: shot.scene.particles })),
    { fps, seed, frame: format },
  );
  return {
    tracks: ROWS.map((name, index) => ({ type: 'video', index, name, clips: rows[name] })),
    markers: shots.map((shot) => ({
      markerId: newId('m'),
      time: shot.startF / fps,
      label: shot.scene.title.replace(/\s+/g, ' ').slice(0, 80),
      color: '',
    })),
    notes,
    seconds: totalF / fps,
    shots,
  };
}
