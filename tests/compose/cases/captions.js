/**
 * Reference documents: captions, drawn by the frame compositor's last pass
 * from the words a host hands it. Every preset in every format over a
 * footage frame, and what only a whole document shows: two voices, a
 * caption over an element and a title, a split clip, words written on the
 * clip, a clip that plays its file from the middle, a font of the
 * document's own.
 * @module tests/compose/cases/captions
 */

import { builtinKit, kitKey, resolveElement, resolveKit } from '#utils/brand/index.js';
import { PRESET_NAMES } from '#utils/captions/index.js';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { WORDS, timed } from '../../captions/scenes.js';

/** @typedef {import('./index.js').Case} Case */

export const TALK = '/media/talk.mp4';
const GUEST = '/media/guest.wav';
const LENGTH = 20;
/**
 * Caption type is small — five hundredths of the frame's shorter side — and
 * outlined, so these documents are drawn half as large again as the other
 * cases: at 360 pixels of height a caption is 12-pixel type, whose edges
 * say more about the rasteriser than about the layout.
 */
const SIZES = {
  wide: { resolution: '1920x1080', size: { width: 960, height: 540 } },
  tall: { resolution: '1080x1920', size: { width: 540, height: 960 } },
  square: { resolution: '1080x1080', size: { width: 540, height: 540 } },
};
/** A moment into the word "features,": its mark is still arriving. */
export const SAYING = WORDS.find(([, , text]) => text === 'features,')[0] + 0.05;
const GUEST_WORDS = timed('Honestly? That sounds about right to me, give or take.', 3.2);
const LYRICS = timed('La la la, written on the clip itself.', 3.4);

/**
 * A clip of the talk: `length` seconds of it from `sourceIn`, at `start`.
 * @param {string} clipId
 * @param {object} [extra]
 * @returns {any}
 */
const talk = (clipId, extra = {}) =>
  createClip({ clipId, sourceFile: TALK, timelineStart: 0, timelineEnd: LENGTH, ...extra });

/**
 * A document that shows the talk and says it: its picture on a video
 * track, linked to its sound, whose captions are on.
 * @param {object} [opts]
 * @param {unknown} [opts.style] - The timeline's caption style
 * @param {keyof typeof SIZES} [opts.format]
 * @param {any[]} [opts.sound] - The clips of the sound track instead of one whole clip
 * @param {any[]} [opts.over] - Video tracks in front of the picture, front first
 * @param {any[]} [opts.more] - Further audio tracks
 * @param {object} [opts.doc] - Document fields
 * @returns {{ edl: any, size: { width: number, height: number } }}
 */
export function spoken(opts = {}) {
  const { resolution, size } = SIZES[opts.format || 'wide'];
  const sound = opts.sound || [talk('a_s', { linkedClipId: 'a', captions: { on: true } })];
  const linked = sound.length === 1 ? { linkedClipId: sound[0].clipId } : {};
  const tracks = [
    ...(opts.over || []).map((clips, i) => createTrack('video', { trackId: `o${i}`, clips })),
    createTrack('video', { trackId: 'v1', clips: [talk('a', linked)] }),
    createTrack('audio', { trackId: 'a1', clips: sound }),
    ...(opts.more || []).map((clips, i) => createTrack('audio', { trackId: `m${i}`, clips })),
  ];
  const captions = opts.style ? { captions: { style: opts.style } } : {};
  return { edl: createEdl({ resolution, tracks, ...captions, ...opts.doc }), size };
}

/**
 * @param {{ card: string, font: string }} files - Fixture files
 * @returns {Case[]}
 */
export function captionCases(files) {
  const footage = { a: files.card };
  const words = { [TALK]: WORDS, [GUEST]: GUEST_WORDS };
  /** @type {(name: string, made: ReturnType<typeof spoken>, time?: number) => Case} */
  const at = (name, { edl, size }, time = SAYING) => ({
    ...{ name: `captions-${name}`, edl, time, text: true, outlined: true, footage, size, words },
  });
  /** @type {Case[]} */
  const cases = [];
  for (const preset of PRESET_NAMES) {
    for (const format of /** @type {const} */ (['wide', 'tall', 'square'])) {
      cases.push(at(`${preset}-${format}`, spoken({ style: { preset }, format })));
    }
  }
  // A guest on a second track speaks over the talk: the captions stack.
  const guest = createClip({
    ...{ clipId: 'g', sourceFile: GUEST, timelineStart: 0, timelineEnd: LENGTH },
    captions: { on: true },
  });
  cases.push(at('two-voices', spoken({ more: [[guest]] })));
  // Over a lower third and a title: captions are the last thing drawn.
  const kit = resolveKit(builtinKit('bold'));
  const design = resolveElement(kit, 'lower-third');
  const slots = { name: 'Ada Lovelace', role: 'Mathematician' };
  const element = { kit: { id: kit.id, key: kitKey(kit) }, id: 'lower-third', slots, design };
  const third = createClip({ clipId: 'el', timelineStart: 0, timelineEnd: LENGTH, element });
  const banner = createClip({
    ...{ clipId: 't', timelineStart: 0, timelineEnd: LENGTH, transform: { y: 300 } },
    text: { content: 'UNDER THE CAPTION', fontSize: 110, background: '#be123c' },
  });
  cases.push(at('over-element-title', spoken({ style: 'boxed', over: [[third], [banner]] })));
  // The clip cut in the middle of the word being said: nothing changes.
  const cut = Math.round((SAYING + 0.03) * 30) / 30;
  const halves = [
    talk('a_s', { timelineEnd: cut, captions: { on: true } }),
    talk('b_s', { timelineStart: cut, sourceIn: cut, captions: { on: true } }),
  ];
  cases.push(at('split', spoken({ sound: halves }), cut + 0.1));
  // Words written on the clip win over its file's transcript.
  const own = talk('a_s', { linkedClipId: 'a', captions: { on: true, words: LYRICS } });
  cases.push(at('inline-words', spoken({ style: 'karaoke', sound: [own] }), LYRICS[2][0] + 0.1));
  // Two seconds into the file, one second into the timeline: words follow the source.
  const late = talk('a_s', {
    ...{ timelineStart: 1, timelineEnd: 9, sourceIn: 2, sourceOut: 10 },
    captions: { on: true },
  });
  cases.push(at('slipped', spoken({ style: 'pop', sound: [late] }), SAYING - 1));
  // At the top, words appearing one by one, in a font the document brings.
  const hidden = { preset: 'clean', unspoken: 'hide', position: { anchor: 'top', offset: 10 } };
  cases.push(at('top-hide', spoken({ style: hidden, format: 'tall' })));
  const fonts = [{ family: 'Brand Hand', weight: 700, style: 'normal', file: files.font }];
  const hand = { preset: 'clean', font: { family: 'Brand Hand', weight: 700 }, size: 8 };
  cases.push(at('document-font', spoken({ style: hand, doc: { fonts } })));
  return cases;
}
