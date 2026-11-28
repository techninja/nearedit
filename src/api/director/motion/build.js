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
export const ROWS = ['Titles', 'Text', 'Particles', 'Accents', 'Background A', 'Background B'];

/**
 * @typedef {Object} BuildOptions
 * @property {{ fps: number, width: number, height: number }} format
 * @property {number|string} seed - Varies colours, directions and moves
 * @property {string} pacing - slow | medium | fast
 * @property {number} [duration] - Target length in seconds; 0 = what the scenes ask for
 * @property {import('./measure.js').Measure} [measure] - Text measurement; the
 *   server canvas by default
 * @property {import('#utils/director/motion/themes.js').Theme} [theme] - The
 *   theme to build in when it is not one of the list: the brand theme
 * @property {import('#utils/brand/types.js').Kit} [kit] - The kit whose
 *   elements draw the scenes that are cards (`scene.kind`)
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
  const theme = options.theme || getTheme(plan.theme) || THEMES[0];
  // A face that is set in capitals: the words are, whatever the plan wrote.
  const set = (/** @type {any} */ scene) => ({
    ...scene,
    title: theme.title.upper && !scene.kind ? scene.title.toUpperCase() : scene.title,
    ...(scene.subtitle && theme.subtitle.upper && { subtitle: scene.subtitle.toUpperCase() }),
  });
  const { shots, totalF, notes } = schedule(plan.scenes.map(set), {
    fps,
    pacing: options.pacing,
    target: options.duration || 0,
  });
  const measure = options.measure || serverMeasure();
  const piece = { plan, theme, format, seed, measure, kit: options.kit };
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
      label: plan.scenes[shot.index].title.replace(/\s+/g, ' ').slice(0, 80),
      color: '',
    })),
    notes,
    seconds: totalF / fps,
    shots,
  };
}
