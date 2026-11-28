/**
 * Completing a motion plan: every choice a scene leaves open is made from
 * the theme, varied by the seed, and every name the vocabularies do not
 * know is replaced the same way and reported. The heuristic planner hands
 * in bare words; a language model hands in whatever it chose — from here
 * on the two are the same plan. Pure.
 * @module api/director/motion/complete
 */

import { BRAND } from '#utils/director/brand/theme.js';
import { AUTO, choose, getTheme, pickTheme } from '#utils/director/motion/themes.js';
import { NONE, PARTICLES, vocabulary } from '#utils/director/motion/vocab.js';
import { CARD_KINDS, sceneKinds } from './kinds.js';

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
 * @property {string} [kind] - `intro`, `chapter` or `outro`: a card the brand
 *   kit draws; absent for an ordinary scene
 * @property {string} [number] - A chapter's number
 * @typedef {{ theme: string, align: 'center'|'left', scenes: Scene[] }} CompletePlan
 */

const ALIGNS = /** @type {const} */ (['center', 'center', 'left']);

/**
 * Complete a plan.
 * @param {{ theme?: string, align?: string, scenes: any[] }} plan - Valid against the plan schema
 * @param {{ theme?: string, seed?: number|string, particles?: string, bumpers?: boolean }} [params] -
 *   The action's parameters: a theme, `brand` or `auto`, the seed, `auto`,
 *   `none` or a particle preset for every scene, and whether a branded
 *   piece opens and closes with the kit's intro and outro
 * @param {import('#utils/director/motion/themes.js').Theme} [brand] - The
 *   brand theme (`brandTheme(kit)`): what `theme: brand` means. Without it
 *   `brand` is read as `auto`
 * @returns {{ plan: CompletePlan, notes: string[] }}
 */
export function completePlan(plan, params = {}, brand) {
  const seed = params.seed ?? 1;
  const notes = [];
  const branded = params.theme === BRAND && Boolean(brand);
  const free = !params.theme || params.theme === AUTO || params.theme === BRAND;
  const named = free ? plan.theme : params.theme;
  const asked = named === BRAND ? undefined : named;
  const theme = branded ? brand : pickTheme(asked, seed);
  if (!branded && asked && asked !== AUTO && !getTheme(asked)) {
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
  const align = ALIGNS.includes(/** @type {any} */ (plan.align))
    ? /** @type {'center'|'left'} */ (plan.align)
    : choose([...ALIGNS], seed, 25);
  if (plan.align && plan.align !== align) {
    notes.push(`Unknown align “${plan.align}” — the text is set ${align} instead.`);
  }
  // The theme's signature background opens the piece; the others follow in the seed's order.
  const others = theme.backgrounds.slice(1);
  const turn = others.length
    ? choose(
        others.map((_, k) => k),
        seed,
        26,
      )
    : 0;
  const grounds = [theme.backgrounds[0], ...others.slice(turn), ...others.slice(0, turn)];
  /** @param {string} type @returns {string} The unit an animation is staggered over */
  const unitOf = (type) =>
    theme.animations.find(([kind]) => kind === type)?.[1] ||
    (type === 'typewriter' ? 'char' : 'word');

  const kinds = sceneKinds(plan.scenes, { branded, bumpers: params.bumpers !== false }, notes);
  let plain = 0;
  const scenes = plan.scenes.map((scene, i) => {
    const card = CARD_KINDS.includes(kinds[i].kind);
    // Backgrounds take turns among the scenes that have one.
    const turn = card ? 0 : plain++;
    /** @param {keyof ReturnType<typeof vocabulary>} field @param {string} fallback */
    const name = (field, fallback) => {
      const value = scene[field];
      if (value === undefined || value === null || value === '') return fallback;
      if (names[field].includes(value)) return value;
      notes.push(`Scene ${i + 1}: unknown ${field} “${value}” — ${fallback} is used instead.`);
      return fallback;
    };
    // Asked in the order the notes should read.
    const background = name('background', grounds[turn % grounds.length]);
    // A card of the brand kit is the kit's own design: nothing is laid over it.
    const particles = card ? NONE : forced || name('particles', piece.particles);
    const accent = card ? NONE : name('accent', piece.accent);
    const look = card ? NONE : name('look', piece.look);
    const textAnimation = name('textAnimation', piece.textAnimation);
    const by = name('by', textAnimation === animation ? unit : unitOf(textAnimation));
    // The piece opens from black.
    const transition = name('transition', i ? piece.transition : 'fade');
    /** @type {Scene} */
    const out = {
      title: scene.title,
      ...(scene.subtitle ? { subtitle: scene.subtitle } : {}),
      background,
      particles,
      accent,
      look,
      textAnimation,
      by,
      transition,
    };
    if (scene.duration > 0) out.duration = scene.duration;
    if (card) out.kind = kinds[i].kind;
    if (kinds[i].number) out.number = kinds[i].number;
    return out;
  });
  if (forced && forced !== NONE && plan.scenes.some((s) => s.particles && s.particles !== forced)) {
    notes.push(`Particles were set to ${forced} for every scene, as asked.`);
  }
  return { plan: { theme: theme.id, align, scenes }, notes };
}
