/**
 * Completing a motion plan: every choice a scene leaves open is made from
 * the theme, varied by the seed, and every name the vocabularies do not
 * know is replaced the same way and reported. The heuristic planner hands
 * in bare words; a language model hands in whatever it chose — from here
 * on the two are the same plan. Pure.
 * @module api/director/motion/complete
 */

import { seedOf } from '#utils/compose/random.js';
import { AUTO, choose, getTheme, pickTheme } from '#utils/director/motion/themes.js';
import { NONE, PARTICLES, vocabulary } from '#utils/director/motion/vocab.js';

/**
 * @typedef {Object} Scene - A scene with every choice made
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} background
 * @property {string} particles
 * @property {string} accent
 * @property {string} look
 * @property {string} textAnimation
 * @property {string} by
 * @property {string} transition
 * @property {number} [duration] - Seconds, when the plan fixed it
 * @typedef {{ theme: string, align: 'center'|'left', scenes: Scene[] }} CompletePlan
 */

const ALIGNS = /** @type {const} */ (['center', 'center', 'left']);

/**
 * Complete a plan.
 * @param {{ theme?: string, align?: string, scenes: any[] }} plan - Valid against the plan schema
 * @param {{ theme?: string, seed?: number|string, particles?: string }} [params] - The
 *   action's parameters: a theme or `auto`, the seed, and `auto`, `none` or a
 *   particle preset for every scene
 * @returns {{ plan: CompletePlan, notes: string[] }}
 */
export function completePlan(plan, params = {}) {
  const seed = seedOf(params.seed ?? 1);
  const notes = [];
  const asked = params.theme && params.theme !== AUTO ? params.theme : plan.theme;
  const theme = pickTheme(asked, seed);
  if (asked && asked !== AUTO && !getTheme(asked)) {
    notes.push(`Unknown theme “${asked}” — ${theme.label} was chosen instead.`);
  }
  const names = vocabulary();
  const [animation, unit] = choose(theme.animations, seed, 21);
  const forced = PARTICLES.includes(params.particles) ? params.particles : '';
  const piece = {
    particles: choose(theme.particles, seed, 22),
    accent: choose(theme.accents, seed, 23),
    look: theme.look,
    textAnimation: animation,
    transition: choose(theme.transitions, seed, 24),
  };
  const align =
    plan.align === 'left' || plan.align === 'center' ? plan.align : choose([...ALIGNS], seed, 25);

  const scenes = plan.scenes.map((scene, i) => {
    /** @param {keyof ReturnType<typeof vocabulary>} field @param {string} fallback */
    const name = (field, fallback) => {
      const value = scene[field];
      if (value === undefined || value === null || value === '') return fallback;
      if (names[field].includes(value)) return value;
      notes.push(`Scene ${i + 1}: unknown ${field} “${value}” — ${fallback} is used instead.`);
      return fallback;
    };
    // The first scene shows the theme's signature background and opens from black.
    const background = i ? choose(theme.backgrounds.slice(1), seed, 26, i - 1) : theme.backgrounds[0];
    const textAnimation = name('textAnimation', piece.textAnimation);
    const by = name('by', textAnimation === animation ? unit : 'word');
    /** @type {Scene} */
    const out = {
      title: scene.title,
      ...(scene.subtitle ? { subtitle: scene.subtitle } : {}),
      background: name('background', background || theme.backgrounds[0]),
      particles: forced || name('particles', piece.particles),
      accent: name('accent', piece.accent),
      look: name('look', piece.look),
      textAnimation,
      by,
      transition: name('transition', i ? piece.transition : 'fade'),
    };
    if (scene.duration > 0) out.duration = scene.duration;
    return out;
  });
  if (forced && forced !== NONE && plan.scenes.some((s) => s.particles && s.particles !== forced)) {
    notes.push(`Particles were set to ${forced} for every scene, as asked.`);
  }
  return { plan: { theme: theme.id, align, scenes }, notes };
}
