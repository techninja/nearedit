/**
 * A site demo in the project's brand: when the request asks for the
 * `brand` theme — the default — the ground takes the kit's colours, every
 * caption is the kit's `caption` element, a title card is its `intro`, and
 * a demo asked for as a finished piece also gets its `outro` and its logo
 * `bug`. All of them are element clips, so they follow the kit.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Site demo.
 * @module api/director/web/brand
 */

import { resolveElement } from '#utils/brand/index.js';
import { elementBounds } from '#utils/brandUi/elementBounds.js';
import { elementClip, elementFor } from '#utils/director/brand/elementClip.js';
import { BRAND, brandTheme } from '#utils/director/brand/theme.js';
import { MAX_SUBTITLE, MAX_TITLE } from '#utils/director/motion/planSchema.js';
import { kitName, kitOf, measureWith } from '../brand/kit.js';
import { tidyText } from '../motion/brief.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */
/** @typedef {{ fps: number, width: number, height: number }} Format */

/** Seconds a card takes to give way to what follows it. */
export const DISSOLVE = 0.4;

/**
 * The brand a demo is made in.
 * @param {import('../pipeline.js').ActionContext} ctx
 * @returns {{ kit: Kit, theme: import('#utils/director/motion/themes.js').Theme, name: string }|null}
 *   null when the request names another theme
 */
export function demoBrand(ctx) {
  if (ctx.directive.params.theme !== BRAND) return null;
  const kit = kitOf(ctx);
  measureWith(kit);
  return { kit, theme: brandTheme(kit), name: kitName(kit) };
}

/**
 * Frames a card of the kit lasts: as long as its element says.
 * @param {Kit} kit
 * @param {'intro'|'outro'} role
 * @param {number} fps
 * @returns {number} 0 when the kit has no such element
 */
export function cardFrames(kit, role, fps) {
  const element = kit.elements?.[elementFor(kit, role)];
  return element ? Math.round((Number(element.duration) || 4) * fps) : 0;
}

/**
 * The title card of a demo as the kit's intro.
 * @param {Kit} kit
 * @param {string} title - '' for no card
 * @param {string} subtitle
 * @param {Format} format
 * @returns {import('./card.js').Card}
 */
export function brandCard(kit, title, subtitle, format) {
  const words = tidyText(title, MAX_TITLE);
  const frames = words ? cardFrames(kit, 'intro', format.fps) : 0;
  const slots = { title: words, subtitle: tidyText(subtitle, MAX_SUBTITLE) };
  const clip = frames
    ? elementClip(
        kit,
        elementFor(kit, 'intro'),
        slots,
        { ...format, startF: 0, endF: frames },
        {
          fadeOut: Math.min(DISSOLVE, frames / format.fps / 3),
          fadeOutCurve: 'smooth',
        },
      )
    : null;
  return { titles: clip ? [clip] : [], text: [], frames: clip ? frames : 0, notes: [] };
}

/**
 * Whether a kit's caption brings a ground of its own — a plate behind its
 * words. One that is set straight on the picture reads on footage; over a
 * web page, which may be white, it cannot be relied on.
 * @param {Kit} kit
 * @returns {boolean}
 */
export function captionHasPlate(kit) {
  const design = resolveElement(kit, elementFor(kit, 'captions'));
  return Boolean(design?.layers.some((layer) => layer.type === 'shape' || layer.plate));
}

/**
 * One caption as the kit's caption element, moved to where the demo wants
 * it: the middle of the band under a window, or the head of the picture.
 * @param {Kit} kit
 * @param {string} words
 * @param {Format & { startF: number, endF: number }} span
 * @param {{ centre?: number, top?: number }} where - Output pixels: the
 *   height its middle belongs at, or where its upper edge does; neither
 *   leaves it where the kit puts it
 * @returns {{ clip: any, box: { x: number, y: number, width: number, height: number } }|null}
 */
export function brandCaption(kit, words, span, where = {}) {
  const clip = elementClip(kit, elementFor(kit, 'captions'), { text: words }, span, {
    label: words.replace(/\s+/g, ' ').slice(0, 48),
  });
  if (!clip) return null;
  const box = elementBounds(clip.element, span);
  let shift = 0;
  if (Number.isFinite(where.centre)) shift = where.centre - (box.y + box.height / 2);
  else if (Number.isFinite(where.top)) shift = where.top - box.y;
  const y = Math.round(shift);
  return {
    clip: y ? { ...clip, transform: { ...clip.transform, y } } : clip,
    box: { ...box, y: box.y + y },
  };
}

/**
 * What the result says about the brand.
 * @param {Object} facts
 * @param {{ name: string }|null} facts.brand
 * @param {{ counts: { captions: number, elements: boolean }, finished: string[] }} facts.built
 * @param {{ frames: number }} facts.card
 * @param {boolean} facts.asked - A finished piece was asked for
 * @returns {string[]}
 */
export function brandNotes({ brand, built, card, asked }) {
  if (!brand) {
    return asked
      ? ['A finished piece — intro, outro and logo — is made with the Brand theme only.']
      : [];
  }
  const parts = [
    ...(card.frames ? ['the title card is its intro'] : []),
    ...(built.counts.captions && built.counts.elements
      ? ['the captions are its caption element']
      : []),
    ...(built.counts.captions && !built.counts.elements
      ? [
          'the captions are set in its type on a plate in its colours — its own caption has ' +
            'no plate, and a page may be white',
        ]
      : []),
    ...built.finished.map((what) => `added: ${what}`),
  ];
  return [
    `On brand: the ground takes the colours of the kit “${brand.name}”` +
      (parts.length ? `; ${parts.join('; ')}` : '') +
      '. Those are element clips — “Update to brand” brings them up to date when the kit changes.',
  ];
}
