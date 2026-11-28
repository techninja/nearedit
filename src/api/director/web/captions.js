/**
 * The captions of a site demo: what each stop says, shown for as long as
 * the stop lasts, set in the theme's reading face on a rounded plate — and
 * placed where it does not cover what is being shown: at the foot of the
 * page, or at its head when the action is down there.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § Captions.
 * @module api/director/web/captions
 */

import { clipAt } from '../motion/clips.js';
import { fitText } from '../motion/typeset.js';
import { shownRect } from './camera.js';

/** @typedef {import('./stage.js').Stage} Stage */
/** @typedef {{ x: number, y: number, width: number, height: number }} Box */

/** Sizes as shares of the frame's shorter side. */
const SIZE = 0.033;
const GAP = 0.03;
/** The plate: padding as a multiple of the font size, and how round its corners are. */
const PADDING = 0.55;
const ROUND = 0.5;
/** Seconds a caption takes to come and go, and the shortest it is worth showing. */
const FADE = 0.2;
const SHORTEST = 0.4;

/**
 * @param {Box} a
 * @param {Box|null} b
 * @returns {number} The area two boxes share
 */
function overlap(a, b) {
  if (!b) return 0;
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * One caption clip.
 * @param {string} words
 * @param {Box|null} busy - Where the action shows in the frame, if anywhere
 * @param {{ stage: Stage, theme: import('#utils/director/motion/themes.js').Theme,
 *   colors: string[], measure: import('../motion/measure.js').Measure }} look
 * @returns {{ fields: object, top: boolean }}
 */
export function captionFields(words, busy, { stage, theme, colors, measure }) {
  const { window: win, frame, short } = stage;
  const font = { ...theme.subtitle, weight: Math.max(theme.subtitle.weight, 500), tracking: 0 };
  const size = Math.round(SIZE * short);
  const box = { width: Math.min(win.width, frame.width) * 0.8, height: win.height * 0.3, lines: 3 };
  const fitted = fitText(words, font, { ...box, size, min: size * 0.75 }, measure);
  const pad = fitted.fontSize * PADDING;
  const plate = { width: fitted.width + 2 * pad, height: fitted.height + 2 * pad };
  const gap = Math.round(GAP * short);
  const x = win.x + (win.width - plate.width) / 2;
  const foot = { x, y: win.y + win.height - gap - plate.height, ...plate };
  const head = { x, y: win.y + gap, ...plate };
  const top = overlap(foot, busy) > 0 && overlap(head, busy) < overlap(foot, busy);
  const at = top ? head : foot;
  return {
    top,
    fields: {
      text: {
        ...fitted.text,
        content: words,
        color: theme.ink,
        background: colors[0],
        boxPadding: PADDING,
        boxRadius: Math.round(fitted.fontSize * ROUND),
      },
      transform: { x: 0, y: Math.round(at.y + plate.height / 2 - frame.height / 2) },
      label: words.replace(/\s+/g, ' ').slice(0, 48),
      intent: 'title',
    },
  };
}

/**
 * The caption clips of a recording.
 * @param {Object} input
 * @param {import('#utils/web/types.js').Track} input.track
 * @param {Record<string, any[]>} input.keys - The camera's keyframes
 * @param {Stage} input.stage
 * @param {import('#utils/director/motion/themes.js').Theme} input.theme
 * @param {string[]} input.colors - The ground's colour way
 * @param {number} input.fps
 * @param {number} input.startF - Frame of the fragment the recording starts on
 * @param {import('../motion/measure.js').Measure} input.measure
 * @returns {{ clips: any[], top: number }} `top`: how many were put at the head
 */
export function captionClips({ track, keys, stage, theme, colors, fps, startF, measure }) {
  const clips = [];
  let top = 0;
  for (const step of track.steps) {
    const words = (step.note || '').trim();
    const fromF = startF + Math.round(step.start * fps);
    const toF = startF + Math.round(step.end * fps);
    if (!words || toF - fromF < SHORTEST * fps) continue;
    // Where the action is while the caption is read: the middle of the pause after it.
    const moment = (step.actionEnd + step.end) / 2;
    const busy =
      step.rect && !step.missing ? shownRect(step.rect, keys, track, stage, moment) : null;
    const made = captionFields(words, busy, { stage, theme, colors, measure });
    if (made.top) top++;
    const fade = Math.min(FADE, (toF - fromF) / fps / 3);
    clips.push(clipAt(fromF, toF, fps, { ...made.fields, fadeIn: fade, fadeOut: fade }));
  }
  return { clips, top };
}
