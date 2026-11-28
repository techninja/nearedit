/**
 * The captions of a site demo: what each stop says, shown for as long as
 * the stop lasts, in the theme's reading face. Under a window they are set
 * on the background, in the band kept for them. Over a page that fills the
 * frame they sit on a rounded plate, placed where it does not cover what
 * is being shown: at the foot of the picture, or at its head when the
 * action is down there. Reference: docs/app-spec/DIRECTOR-WEB.md § Captions.
 * @module api/director/web/captions
 */

import { clipAt } from '../motion/clips.js';
import { fitText } from '../motion/typeset.js';
import { CLEARLY, busyBox, captionStops, overlap } from './captionStops.js';

/** @typedef {import('./stage.js').Stage} Stage */
/** @typedef {import('./stage.js').Box} Box */
/**
 * @typedef {Object} CaptionLook
 * @property {Stage} stage
 * @property {import('#utils/director/motion/themes.js').Theme} theme
 * @property {string[]} colors - The ground's colour way
 * @property {import('../motion/measure.js').Measure} measure
 */

/** Sizes as shares of the frame's shorter side. */
const SIZE = { band: 0.036, plate: 0.033 };
const GAP = 0.03;
/** The plate: padding as a multiple of the font size, and how round its corners are. */
const PADDING = 0.55;
const ROUND = 0.5;
/** Seconds a caption takes to come and go. */
const FADE = 0.2;

/**
 * A caption in the band under the window: words on the background, with
 * the shadow (or halo) the theme gives its titles.
 * @param {string} words
 * @param {CaptionLook} look
 * @returns {object} Clip fields
 */
function bandFields(words, { stage, theme, colors, measure }) {
  const { band, frame, short } = stage;
  const font = { ...theme.subtitle, weight: Math.max(theme.subtitle.weight, 500), tracking: 0 };
  const size = Math.round(SIZE.band * short);
  const box = { width: band.width * 0.94, height: band.height * 0.8, lines: 3 };
  const fitted = fitText(words, font, { ...box, size, min: size * 0.7 }, measure);
  const shade = theme.halo || (theme.shadow ? colors[0] : '');
  // A touch above the middle of the band: the window's shadow falls into it.
  const y = band.y + band.height * 0.52 - frame.height / 2;
  return {
    text: {
      ...fitted.text,
      content: words,
      color: theme.ink,
      ...(shade && { shadowColor: shade, shadowBlur: Math.round(fitted.fontSize * 0.3) }),
    },
    transform: { x: 0, y: Math.round(y) },
  };
}

/**
 * A caption over the page: on a plate, at the foot — or the head — of the picture.
 * @param {string} words
 * @param {Box|null} busy - Where the action shows in the frame, if anywhere
 * @param {CaptionLook} look
 * @returns {{ fields: object, top: boolean }}
 */
function plateFields(words, busy, { stage, theme, colors, measure }) {
  const { window: win, frame, short } = stage;
  const font = { ...theme.subtitle, weight: Math.max(theme.subtitle.weight, 500), tracking: 0 };
  const size = Math.round(SIZE.plate * short);
  const box = { width: win.width * 0.8, height: win.height * 0.3, lines: 3 };
  const fitted = fitText(words, font, { ...box, size, min: size * 0.75 }, measure);
  const pad = fitted.fontSize * PADDING;
  const plate = { width: fitted.width + 2 * pad, height: fitted.height + 2 * pad };
  const gap = Math.round(GAP * short);
  const x = win.x + (win.width - plate.width) / 2;
  const foot = { x, y: win.y + win.height - gap - plate.height, ...plate };
  const head = { x, y: win.y + gap, ...plate };
  // The head only when it is clearly the freer place: something that fills the picture is under both.
  const worse = overlap(foot, busy) - overlap(head, busy);
  const top = worse > CLEARLY * plate.width * plate.height;
  const at = top ? head : foot;
  const radius = Math.round(fitted.fontSize * ROUND);
  return {
    top,
    fields: {
      text: {
        ...fitted.text,
        content: words,
        color: theme.ink,
        ...{ background: colors[0], boxPadding: PADDING, boxRadius: radius },
      },
      transform: { x: 0, y: Math.round(at.y + plate.height / 2 - frame.height / 2) },
    },
  };
}

/**
 * The caption clips of a recording: one per stop that says something,
 * from the first of its steps to the end of its last.
 * @param {CaptionLook & { track: import('#utils/web/types.js').Track, owners: number[],
 *   keys: Record<string, any[]>, fps: number, startF: number }} input - `owners`:
 *   per step, the stop it belongs to; `keys`: the camera's keyframes;
 *   `startF`: the frame of the fragment the recording starts on
 * @returns {{ clips: any[], top: number }} `top`: how many were put at the head
 */
export function captionClips({ track, owners, keys, fps, startF, ...look }) {
  const { stage } = look;
  const clips = [];
  let top = 0;
  for (const { words, fromF, toF, last } of captionStops({ track, owners, fps, startF })) {
    const busy = stage.band ? null : busyBox(last, keys, track, stage);
    const made = stage.band
      ? { fields: bandFields(words, look), top: false }
      : plateFields(words, busy, look);
    if (made.top) top++;
    const fade = Math.min(FADE, (toF - fromF) / fps / 3);
    const label = words.replace(/\s+/g, ' ').slice(0, 48);
    const more = { label, intent: 'title', fadeIn: fade, fadeOut: fade };
    clips.push(clipAt(fromF, toF, fps, { ...made.fields, ...more }));
  }
  return { clips, top };
}
