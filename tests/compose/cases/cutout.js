/**
 * Reference documents: the person cutout — a clip drawn through the matte
 * of its packed frame — and the outline effect. Every mode, the extremes of
 * feather and shrink, under a transform and a crop, with a drop shadow and
 * an outline, over footage and over a generator, in a wide, a tall and a
 * square frame; and a clip whose cutout is not there, which draws its
 * plain picture.
 * @module tests/compose/cases/cutout
 */

import { doc, gen, media, title } from '../build.js';
import { sky } from './generators.js';

/** @typedef {import('./index.js').Case} Case */

const FILE = '/media/me.mp4';
/** What the clip remembers of its cutout: the fixture is one frame of it. */
export const MADE = {
  ...{ file: '/media/.nearedit/cutout/0a51bd39df6c629f93d1.mp4', key: '0a51bd39df6c629f93d1' },
  ...{ source: FILE, start: 0, end: 4, fps: 30, width: 640, height: 360, frames: 120 },
};
const SIZES = {
  wide: { resolution: '1920x1080', size: { width: 640, height: 360 } },
  tall: { resolution: '1080x1920', size: { width: 360, height: 640 } },
  square: { resolution: '1080x1080', size: { width: 480, height: 480 } },
};
/** An effect stack from `[type, params]` pairs. */
const stack = (/** @type {[string, object?][]} */ ...list) =>
  list.map(([type, params = {}], i) => ({ effectId: `fx_${i}`, type, enabled: true, params }));
const shadow = /** @type {[string, object]} */ (['dropShadow', { x: 26, y: 26, blur: 18 }]);

/**
 * The clip of the person: clip `me`, cutout on.
 * @param {object} [cutout] - Settings
 * @param {object} [extra] - Clip fields
 * @returns {any}
 */
export const person = (cutout = {}, extra = {}) =>
  media('me', FILE, { cutout: { on: true, ...cutout, made: MADE }, ...extra });

/**
 * @param {{ card: string, packed: string }} files - Fixture pictures
 * @returns {Case[]}
 */
export function cutoutCases(files) {
  const footage = { me: files.packed, a: files.card };
  const card = () => media('a', '/media/broll.mp4');
  /** @type {(name: string, edl: any, size?: object, feeds?: object) => Case} */
  const at = (name, edl, size, feeds = footage) => ({
    ...{ name: `cutout-${name}`, edl, time: 1.5, text: false, footage: feeds },
    ...(size ? { size } : {}),
  });
  /** The person over the sky generator. */
  const over = (/** @type {object} */ cutout, /** @type {object} */ extra) =>
    doc([[person(cutout, extra)], [sky()]]);
  const corner = { scaleX: 0.5, scaleY: 0.5, x: -420, y: 230, rotation: -8 };
  const cropped = { cropLeft: 0.22, cropRight: 0.3, cropTop: 0.08, fit: 'contain', scaleX: 0.8 };
  const cases = [
    at('remove', over({}, {})),
    at('over-footage', doc([[person()], [card()]])),
    at('blur', doc([[person({ mode: 'blur' })]])),
    at('blur-strong', over({ mode: 'blur', blur: 12, feather: 1.5 }, { transform: corner })),
    at('feather-none', over({ feather: 0, shrink: 0 }, {})),
    at('feather-wide', over({ feather: 5, shrink: 0 }, {})),
    at('shrink-in', over({ shrink: 3 }, {})),
    at('shrink-out', over({ shrink: -3, feather: 1 }, {})),
    at('transform', doc([[person({}, { transform: corner })], [card()]])),
    at('crop', over({ shrink: 0.4 }, { transform: cropped })),
    at('shadow', over({}, { effects: stack(shadow) })),
    at('outline', over({}, { effects: stack(['outline', { color: '#fde047', width: 1.2 }]) })),
    at(
      'sticker',
      doc([
        [
          person(
            { feather: 0.2 },
            {
              transform: { ...corner, x: 420 },
              effects: stack(['outline', { width: 2.4 }], shadow),
            },
          ),
        ],
        [card()],
      ]),
    ),
    at('faded', over({}, { transform: { opacity: 0.6 }, blendMode: 'screen' })),
    // No cutout file yet, and a host that hands over the plain picture: both draw it.
    at('missing', doc([[media('me', FILE, { cutout: { on: true } })]]), undefined, {
      me: files.card,
    }),
    at('plain-frame', doc([[person()]]), undefined, { me: files.card }),
  ];
  for (const format of /** @type {const} */ (['tall', 'square'])) {
    const { resolution, size } = SIZES[format];
    // Tall: the whole picture inside the frame. Square: its foot on the frame's.
    const fitted = { fit: 'contain', y: format === 'tall' ? 420 : 240 };
    const stuck = stack(['outline', { width: 1 }], shadow);
    // The card would be enlarged four times in a square frame: the sky needs no pixels.
    const behind = format === 'tall' ? card() : sky();
    const edl = doc([[person({}, { transform: fitted, effects: stuck })], [behind]], {
      resolution,
    });
    cases.push(at(format, edl, size));
    cases.push(at(`blur-${format}`, doc([[person({ mode: 'blur' })]], { resolution }), size));
  }
  return cases;
}

/**
 * The outline effect on shapes that are not people. Clip `a` is footage:
 * give it the card as its frame.
 * @returns {Record<string, any>} Documents by case name
 */
export function outlineDocs() {
  const star = { shape: 'star', fill: '#f97316', width: 0.4, height: 0.5 };
  const on = (/** @type {object} */ params) => ({ effects: stack(['outline', params]) });
  return {
    'fx-outline': doc([[gen('s', 'shape', star, on({ width: 2 }))], [sky()]]),
    'fx-outline-thin': doc([
      [gen('s', 'shape', star, on({ width: 0.3, color: '#0f172a' }))],
      [sky()],
    ]),
    'fx-outline-soft': doc([
      [gen('s', 'shape', star, on({ width: 4, softness: 0.6, color: '#22d3ee80' }))],
      [sky()],
    ]),
    // A photograph with a border: square corners, turned, with a shadow after it.
    'fx-outline-photo': doc([
      [
        media('a', '/media/photo.mp4', {
          transform: { scaleX: 0.5, scaleY: 0.5, rotation: 7 },
          effects: stack(['outline', { width: 1.6 }], shadow),
        }),
      ],
      [sky()],
    ]),
    'fx-outline-title': doc([
      [title('t', 'STICKER', { fontSize: 260, color: '#be123c' }, on({ width: 1.5 }))],
      [sky()],
    ]),
  };
}
