/**
 * Reference documents: captions that make room for a brand overlay. Every
 * preset in every format over a lower third that is in its way — in a wide
 * and a tall frame one with a long name, so its plate reaches the middle of
 * the frame or up to the caption; in a square frame an ordinary one is
 * there already — and what only a whole document shows: a group that begins
 * after the lower third has left, one that began under it and outlasts it,
 * the switch turned off, a brand caption element, a caption at the top
 * under a lower third that was dragged and enlarged, two voices, a lower
 * third that travels.
 * @module tests/compose/cases/captionsRoom
 */

import { builtinKit, kitKey, resolveElement, resolveKit } from '#utils/brand/index.js';
import { PRESET_NAMES } from '#utils/captions/index.js';
import { createClip } from '#utils/edl/factory.js';
import { WORDS, timed } from '../../captions/scenes.js';
import { SAYING, TALK, spoken } from './captions.js';

/** @typedef {import('./index.js').Case} Case */

const LENGTH = 20;
const GUEST = '/media/guest.wav';
const GUEST_WORDS = timed('Honestly? That sounds about right to me, give or take.', 3.2);
/** A different kit under each preset: four designs of a lower third. */
const KITS = {
  clean: 'clean',
  pop: 'bold',
  karaoke: 'documentary',
  boxed: 'playful',
  minimal: 'clean',
};
/** Long enough for the lower third to reach under a caption in the middle of a wide frame. */
export const LONG = {
  name: 'Augusta Ada King, Countess of Lovelace',
  role: 'Mathematician and the first programmer',
};
export const SHORT = { name: 'Ada Lovelace', role: 'Mathematician' };
/** When "37" is said: the group on screen at `SAYING` starts here in three presets of five. */
export const GROUP_START = WORDS.find(([, , text]) => text === '37')[0];

/**
 * An element clip of a built-in kit, over the whole talk unless told otherwise.
 * @param {string} kitName
 * @param {string} id - The element
 * @param {Record<string, string>} slots
 * @param {object} [extra] - Clip fields
 * @returns {any}
 */
export function overlay(kitName, id, slots, extra = {}) {
  const kit = resolveKit(builtinKit(kitName));
  const design = resolveElement(kit, id);
  const element = { kit: { id: kit.id, key: kitKey(kit) }, id, slots, design };
  return createClip({ clipId: 'el', timelineStart: 0, timelineEnd: LENGTH, element, ...extra });
}

/**
 * The documents, by name: `[document and canvas size, time]`.
 * @returns {Record<string, [ReturnType<typeof spoken>, number]>}
 */
export function roomDocs() {
  /** @type {Record<string, [ReturnType<typeof spoken>, number]>} */
  const docs = {};
  for (const preset of PRESET_NAMES) {
    for (const format of /** @type {const} */ (['wide', 'tall', 'square'])) {
      const slots = format === 'square' ? SHORT : LONG;
      const third = overlay(KITS[/** @type {keyof typeof KITS} */ (preset)], 'lower-third', slots);
      docs[`${preset}-${format}`] = [
        spoken({ style: { preset }, format, over: [[third]] }),
        SAYING,
      ];
    }
  }
  const third = (/** @type {object} */ extra) => overlay('clean', 'lower-third', LONG, extra);
  // The lower third has left before the group begins: the caption is where it always was.
  docs.after = [spoken({ over: [[third({ timelineEnd: GROUP_START - 0.5 })]] }), SAYING];
  // It leaves a moment into the group: the group stays where it was put.
  docs.held = [spoken({ over: [[third({ timelineEnd: GROUP_START + 0.1 })]] }), SAYING];
  // Switched off, the caption is drawn over the lower third.
  docs.off = [spoken({ style: { preset: 'clean', avoid: false }, over: [[third({})]] }), SAYING];
  // A brand caption — one line of description — sits where the words would go.
  const line = overlay('bold', 'caption', { text: 'Recorded live at the Science Museum' });
  docs['caption-element'] = [spoken({ style: 'karaoke', over: [[line]] }), SAYING];
  // Captions at the top; a lower third dragged up there and enlarged: they go below it.
  const dragged = overlay('playful', 'lower-third', SHORT, {
    transform: { x: 760, y: -850, scaleX: 1.3, scaleY: 1.3 },
  });
  const top = { preset: 'boxed', position: { anchor: 'top', offset: 8 } };
  docs['top-dragged'] = [spoken({ style: top, over: [[dragged]] }), SAYING];
  // Two voices: the stack moves as one.
  const guest = createClip({
    ...{ clipId: 'g', sourceFile: GUEST, timelineStart: 0, timelineEnd: LENGTH },
    captions: { on: true },
  });
  docs['two-voices'] = [spoken({ over: [[third({})]], more: [[guest]] }), SAYING];
  // A short lower third that travels across the frame: in the way for a part of the group.
  const travelling = overlay('documentary', 'lower-third', SHORT, {
    keyframes: {
      'transform.x': [
        { t: GROUP_START - 0.2, v: -200 },
        { t: GROUP_START + 0.6, v: 900 },
      ],
    },
  });
  docs.travelling = [spoken({ style: 'pop', over: [[travelling]] }), SAYING];
  return docs;
}

/**
 * @param {{ card: string }} files - Fixture files
 * @returns {Case[]}
 */
export function roomCases(files) {
  const footage = { a: files.card };
  const words = { [TALK]: WORDS, [GUEST]: GUEST_WORDS };
  return Object.entries(roomDocs()).map(([name, [{ edl, size }, time]]) => ({
    ...{ name: `captions-room-${name}`, edl, time, text: true, outlined: true },
    ...{ footage, size, words },
  }));
}
