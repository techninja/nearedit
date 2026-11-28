/**
 * The brand theme — a motion theme made from a kit's tokens, so that a
 * motion piece or the ground of a site demo wears the project's brand
 * without being asked: colours by role (the background and surface as
 * grounds, lit by the primary and the accent; the text and muted colours
 * as ink), the heading and body fonts, the line thickness, and the kit's
 * way of arriving. Grounds are kept dark or light enough for the brand's
 * own text colour to read on every one of them.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The brand theme.
 * Isomorphic and pure.
 * @module utils/director/brand/theme
 */

import { contrast, luminance, mix } from '#utils/director/motion/color.js';

/** @typedef {import('#utils/director/motion/themes.js').Theme} Theme */
/** @typedef {import('#utils/brand/types.js').Kit} Kit */

/** The id of the theme, and the value of `theme` that asks for it. */
export const BRAND = 'brand';
/** Least contrast of the theme's ink on its grounds (as every theme keeps). */
const READS = 4.5;

/** How a kit's `motion.enter` arrives as a text animation. */
const ENTERS = {
  ...{ none: 'none', fade: 'fade', scale: 'scale', blur: 'blur', type: 'typewriter' },
  ...{ wipe: 'slide-right', 'slide-up': 'slide-up', 'slide-down': 'slide-down' },
  ...{ 'slide-left': 'slide-left', 'slide-right': 'slide-right' },
};
/** …and the transitions between scenes that go with it, the usual one first. */
const CHANGES = { wipe: ['wipe', 'fade'], scale: ['iris', 'fade'], none: ['cut', 'fade'] };

/** @type {WeakMap<object, Theme>} */
const made = new WeakMap();

/**
 * A ground tinted towards a colour, as far as the ink still reads on it.
 * @param {string} ground
 * @param {string} tint
 * @param {number} share - How far to go at most, 0 … 1
 * @param {string} ink
 * @returns {string}
 */
function tinted(ground, tint, share, ink) {
  let at = share;
  for (let i = 0; i < 8 && contrast(ink, mix(ground, tint, at)) < READS; i++) at *= 0.6;
  return contrast(ink, mix(ground, tint, at)) < READS ? ground : mix(ground, tint, at);
}

/**
 * @param {Record<string, any>} font - A font token
 * @param {number} size - Largest size, as a share of the frame's shorter side
 * @param {[number, number]} range - Smallest and largest the size may come to
 * @returns {import('#utils/director/motion/themes.js').ThemeFont}
 */
function face(font, size, [least, most]) {
  const scale = Number.isFinite(font?.scale) && font.scale > 0 ? font.scale : 1;
  return {
    fontFamily: font?.family || 'Inter',
    weight: Number.isFinite(font?.weight) ? font.weight : 400,
    italic: Boolean(font?.italic),
    size: Math.min(most, Math.max(least, size * scale)),
    lineHeight: Number.isFinite(font?.lineHeight) ? font.lineHeight : 1.1,
    tracking: Number.isFinite(font?.tracking) ? font.tracking : 0,
    upper: Boolean(font?.upper),
  };
}

/**
 * The theme a kit amounts to.
 * @param {Kit} kit - An effective kit (`resolveKit`)
 * @returns {Theme} The same object for the same kit
 */
export function brandTheme(kit) {
  const known = made.get(kit);
  if (known) return known;
  const { color = {}, font = {}, shape = {}, motion = {} } = kit.tokens || {};
  const ground = color.background || '#0b1220';
  const reads = contrast(color.text || '', ground) >= READS;
  // Text that would not read on the brand's own ground: black or white, whichever reads better.
  const white = contrast('#ffffff', ground) >= contrast('#000000', ground);
  const ink = reads ? color.text : white ? '#ffffff' : '#000000';
  const dark = luminance(ink) > luminance(ground);
  const away = dark ? '#000000' : '#ffffff';
  const surface = contrast(ink, color.surface || ground) >= READS ? color.surface : ground;
  const lit = (/** @type {string} */ from, /** @type {string} */ tint, /** @type {number} */ far) =>
    tinted(from, tint || from, far, ink);
  const edge = mix(ground, away, dark ? 0.45 : 0.5);
  /** @type {[string, string, string][]} */
  const backdrops = dark
    ? [
        [edge, lit(ground, color.primary, 0.2), lit(ground, color.primary, 0.55)],
        [edge, surface, lit(surface, color.primary, 0.4)],
        [edge, lit(ground, color.accent, 0.14), lit(ground, color.accent, 0.4)],
      ]
    : [
        [lit(ground, color.primary, 0.16), ground, edge],
        [lit(ground, color.accent, 0.14), ground, surface],
        [lit(ground, ink, 0.1), lit(ground, color.primary, 0.06), edge],
      ];
  let sub = color.muted || ink;
  const grounds = backdrops.flat();
  for (let i = 0; i < 5 && grounds.some((tone) => contrast(sub, tone) < READS); i++) {
    sub = mix(sub, ink, 0.35);
  }
  if (grounds.some((tone) => contrast(sub, tone) < READS)) sub = ink;
  const round = Number(shape.radius) >= 2;
  const enter = Object.hasOwn(ENTERS, motion.enter) ? motion.enter : 'fade';
  const transitions = CHANGES[enter] || (enter.startsWith('slide') ? ['wipe', 'fade'] : ['fade']);
  const light = round ? ['dots', 'spotlight', 'solid'] : ['solid', 'spotlight', 'grid'];
  const stroke = Number(shape.stroke) > 0 ? Number(shape.stroke) / 100 : 0;
  /** @type {Theme} */
  const theme = {
    id: BRAND,
    label: kit.name || kit.id || 'Brand',
    description: 'The project’s brand kit: its colours, its fonts, its way of moving',
    ink,
    sub,
    accent: contrast(color.primary || ink, ground) >= 1.6 ? color.primary : color.accent || ink,
    backdrops,
    shadow: dark,
    title: face(font.heading, 0.15, [0.1, 0.24]),
    subtitle: { ...face(font.body, 0.046, [0.034, 0.07]), animation: 'fade' },
    backgrounds: dark ? ['spotlight', 'gradient', 'noise'] : light,
    particles: ['none'],
    animations: [[ENTERS[enter], enter === 'type' ? 'char' : motion.by || 'word']],
    accents: stroke ? ['rule', round ? 'ring' : 'frame', 'none'] : ['none'],
    transitions,
    look: 'none',
    stroke,
  };
  made.set(kit, theme);
  return theme;
}

/**
 * The font files of a kit that a theme's two faces need: what a document
 * must list for titles set in them to draw.
 * @param {Kit} kit
 * @param {Theme} theme
 * @returns {import('#utils/brand/fontTable.js').FontFace[]}
 */
export function themeFonts(kit, theme) {
  const families = [theme.title.fontFamily, theme.subtitle.fontFamily].map((name) =>
    String(name).toLowerCase(),
  );
  return (kit.fonts || []).filter((entry) => families.includes(entry.family.toLowerCase()));
}
