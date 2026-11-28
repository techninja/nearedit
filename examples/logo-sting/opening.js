/**
 * The opening: on the navy ground the logo builds itself and holds. The
 * playhead comes in from the left and stops; the E's three clips slide out
 * from behind it, one after another; the other letters settle into place,
 * nearest the E first. Shapes, text and keyframes only — no picture.
 * @module examples/logo-sting/opening
 */

import {
  BASELINE,
  CLIP,
  CLIPS,
  FONT_SIZE,
  INK,
  LETTERS,
  STEM,
  WORDMARK,
  playheadParts,
} from './logo.js';
import { keys, layer, rectangle, space } from './sheet.js';

/** One frame at 30 a second. */
const F = 1 / 30;

/** Length of the piece, seconds. */
export const OPENING_SECONDS = 3.6;

/** When things happen, in frames. */
const AT = {
  playhead: [6, 27], // comes in … has stopped
  clips: [24, 28, 32], // each starts to slide out
  slide: 15, // … and takes this long
  letters: 34, // the first letters start to settle
  apart: 2, // … the next ones this much later
  settle: 16,
};

/**
 * The opening for one frame size.
 * @param {{ width: number, height: number }} frame
 * @returns {Record<string, any>} A NearEdit document
 */
export function buildOpening({ width, height }) {
  // The wordmark takes 57 % of a wide frame's width and 80 % of a tall one's.
  const share = width > height ? 0.57 : 0.8;
  const unit = Math.round(((width * share) / WORDMARK.width) * 20) / 20;
  const s = space(unit, WORDMARK.width / 2, 50);
  const D = OPENING_SECONDS;
  const x = WORDMARK.stem;

  // The playhead: every part rides the same keys, from beyond the left edge.
  const from = -(width / 2 + s.x(x) + s.len(40));
  const playhead = playheadParts(s, x).map(({ name, generator }) => {
    const rest = generator.params.offsetX;
    const ride = keys([
      [AT.playhead[0] * F, rest + from, 'ease-out'],
      [AT.playhead[1] * F, rest],
    ]);
    return layer(`Playhead ${name}`, D, {
      generator,
      keyframes: { 'generator.params.offsetX': ride },
    });
  });

  // The clips: each waits behind the playhead — a mask keeps only what is
  // right of the stem's middle — and slides out to its place.
  const mid = x + STEM / 2;
  const kept = {
    shape: 'rectangle',
    center: { x: 0.5 + s.x(mid + 45) / width, y: 0.5 },
    width: s.len(90) / width,
    height: s.len(110) / height,
  };
  const clips = CLIPS.map((clip, i) => {
    const w = clip.end - STEM / 2;
    const box = { x: mid, y: clip.y, w, h: CLIP.height, radius: CLIP.radius, fill: clip.fill };
    const generator = rectangle(s, box);
    const rest = generator.params.offsetX;
    const start = AT.clips[i] * F;
    const slide = keys([
      [start, rest - s.len(w + 2), 'back-out'],
      [start + AT.slide * F, rest],
    ]);
    return layer(`Clip ${clip.name}`, D, {
      generator,
      effects: [{ effectId: 'reveal', type: 'mask', params: kept }],
      keyframes: { 'generator.params.offsetX': slide },
    });
  });

  // The letters: one title each, so each can settle on its own.
  const fontSize = s.len(FONT_SIZE);
  const y = s.y(100) - Math.round(BASELINE * fontSize * 100) / 100;
  const letters = LETTERS.map(([letter, at], i) => {
    // Nearest the E first: r a e N on its left, d i t on its right.
    const turn = i < 4 ? 3 - i : i - 4;
    const start = (AT.letters + turn * AT.apart) * F;
    const text = { content: letter, fontFamily: 'Inter', weight: 700, fontSize, color: INK.white };
    return layer(`Letter ${letter}`, D, {
      text,
      transform: { x: s.x(at), y },
      keyframes: {
        'transform.y': keys([
          [start, y + s.len(14), 'ease-out'],
          [start + AT.settle * F, y],
        ]),
        'transform.opacity': keys([
          [start, 0, 'ease-out'],
          [start + AT.settle * F * 0.75, 1],
        ]),
      },
    });
  });

  return {
    version: 3,
    fps: 30,
    resolution: `${width}x${height}`,
    background: INK.navy,
    tracks: [...playhead.reverse(), ...clips, ...letters],
  };
}
