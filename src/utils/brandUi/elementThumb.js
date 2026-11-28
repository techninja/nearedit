/**
 * Small pictures of brand elements, drawn by the real compositor: a
 * one-element document with sample text over a sample picture, framed
 * closer on what the element shows so it can be read on a tile. Used by
 * the tiles of the Create tab, the kits of the Brand dialog and its live
 * preview. Pure and isomorphic.
 * @module utils/brandUi/elementThumb
 */

import { coverTime, kitKey } from '#utils/brand/index.js';
import { cropThumb } from '#utils/create/thumbDoc.js';
import { createEdl, parseResolution } from '#utils/edl/factory.js';
import { insertGenerator } from '#utils/edl/generator.js';
import { tracksOfType } from '#utils/edl/immutable.js';
import { addTrack } from '#utils/edl/trackOps.js';
import { elementClips, insertElement } from '#utils/edl/index.js';
import { elementBounds, framing } from './elementBounds.js';
import { sampleSlots, slotSpecs } from './elementList.js';

/** @typedef {import('#utils/create/thumbDoc.js').ThumbSpec} ThumbSpec */
/** @typedef {{ resolution?: string, fps?: number }} Like */

/** The sample picture: dusk over water — mid-tones, so light and dark plates both read. */
const SKY = {
  ...{ kind: 'linear', angle: 180, stops: 4 },
  ...{ color1: '#27344f', color2: '#5b6f93', color3: '#c98f7c', color4: '#3b3f55' },
  ...{ position1: 0, position2: 0.42, position3: 0.62, position4: 1 },
};
const SUN = {
  ...{ kind: 'radial', center: { x: 0.68, y: 0.58 }, size: 0.42, stops: 3 },
  ...{ color1: '#ffe2b0d9', color2: '#f2a66a59', color3: '#f2a66a00' },
};

/**
 * @param {Like} [like] - The open document
 * @returns {any} An empty document of the same shape
 */
const blank = (like = {}) =>
  createEdl({ resolution: like.resolution || '1920x1080', fps: like.fps > 0 ? like.fps : 30 });

/**
 * @param {any} doc
 * @param {Record<string, any>} params - Of a gradient
 * @param {number} duration
 * @returns {any} The document with that gradient on a new track behind everything
 */
function behind(doc, params, duration) {
  const wider = addTrack(doc, 'video', { position: 'bottom' });
  const lane = tracksOfType(wider, 'video');
  const { trackId } = lane[lane.length - 1];
  const generator = { type: 'gradient', params, seed: 1 };
  return insertGenerator(wider, generator, { time: 0, duration, trackId, label: 'Sample picture' });
}

/**
 * Put the sample picture behind everything for a stretch of time.
 * @param {any} doc
 * @param {number} duration - Seconds
 * @returns {any}
 */
export const withSamplePicture = (doc, duration) =>
  behind(behind(doc, SUN, duration), SKY, duration);

/**
 * The moment an element is shown at while its picture is at rest: arrived
 * and not yet leaving; a transition at the moment it covers the frame.
 * @param {import('#utils/brand/types.js').Design|undefined} design
 * @param {number} duration
 * @returns {number} Seconds from its start
 */
export function restMoment(design, duration) {
  return design?.kind === 'transition' ? coverTime(design, duration) : duration * 0.6;
}

/** @type {WeakMap<object, Map<string, ThumbSpec>>} Thumbnails by kit object */
const thumbs = new WeakMap();

/**
 * The thumbnail of one element of a kit.
 * @param {import('#utils/brand/types.js').Kit} kit - An effective kit
 * @param {string} elementId
 * @param {Like} [like] - The open document: its shape is the thumbnail's
 * @param {{ close?: boolean }} [opts] - `close: false` shows the whole frame
 * @returns {ThumbSpec} `doc` has no clip when the kit has no such element
 */
export function elementThumb(kit, elementId, like = {}, opts = {}) {
  const id = `${elementId}|${like.resolution}|${like.fps}|${opts.close !== false}|${kitKey(kit)}`;
  let known = thumbs.get(kit);
  if (!known) thumbs.set(kit, (known = new Map()));
  if (known.has(id)) return known.get(id);
  const slots = sampleSlots(slotSpecs(kit, elementId));
  const element = Object.hasOwn(kit.elements || {}, elementId) ? kit.elements[elementId] : null;
  const duration = element?.duration > 0 ? element.duration : 5;
  const alone = insertElement(blank(like), kit, elementId, slots, {
    time: 0,
    duration,
    ripple: false,
  });
  // A segment fills the frame by itself; anything else is shown over a picture.
  const doc = element?.kind === 'segment' ? alone : withSamplePicture(alone, duration);
  const [placed] = elementClips(doc);
  const out = parseResolution(doc.resolution);
  if (placed && opts.close !== false) {
    cropThumb(doc, framing(elementBounds(placed.clip.element, out), out));
  }
  const spec = { doc, duration, still: restMoment(placed?.clip.element.design, duration) };
  known.set(id, spec);
  return spec;
}
