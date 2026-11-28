/**
 * A site demo as a finished piece in the brand: the kit's logo `bug` over
 * the recording and its `outro` after it, on a row of their own in front
 * of everything. (The opening is the title card, which a demo on brand
 * draws with the kit's `intro`.)
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Site demo.
 * @module api/director/web/finish
 */

import { elementClip, elementFor } from '#utils/director/brand/elementClip.js';
import { DISSOLVE, cardFrames } from './brand.js';

/** The row the bug and the outro go on. */
export const BRAND_ROW = 'Brand';

/**
 * Frames by which a finished demo is longer than its recording and card.
 * @param {import('#utils/brand/types.js').Kit} kit
 * @param {number} fps
 * @returns {number}
 */
export function finishFrames(kit, fps) {
  const outro = cardFrames(kit, 'outro', fps);
  return outro ? outro - Math.min(Math.round(DISSOLVE * fps), outro >> 1) : 0;
}

/**
 * Add the bug and the outro to a built demo.
 * @param {import('./build.js').BuiltDemo} built
 * @param {Object} piece
 * @param {import('#utils/brand/types.js').Kit} piece.kit
 * @param {{ fps: number, width: number, height: number }} piece.format
 * @param {number} piece.startF - The frame the recording starts on
 * @param {string} piece.title - What the outro says
 * @param {string} piece.text - Its second line: where to go next
 * @returns {import('./build.js').BuiltDemo & { finished: string[] }} `finished`:
 *   what was added, in words
 */
export function finishDemo(built, { kit, format, startF, title, text }) {
  const { fps } = format;
  const endF = Math.round(built.seconds * fps);
  const outroF = cardFrames(kit, 'outro', fps);
  const meetF = endF - (outroF - finishFrames(kit, fps));
  const bug =
    meetF - startF > fps / 2
      ? elementClip(kit, elementFor(kit, 'bug'), {}, { ...format, startF, endF: meetF })
      : null;
  const outro = outroF
    ? elementClip(
        kit,
        elementFor(kit, 'outro'),
        { title, text },
        { ...format, startF: meetF, endF: meetF + outroF },
        { fadeIn: (endF - meetF) / fps, fadeInCurve: 'smooth' },
      )
    : null;
  const clips = [bug, outro].filter(Boolean);
  if (!clips.length) return { ...built, finished: [] };
  return {
    ...built,
    tracks: [
      { type: 'video', index: 0, name: BRAND_ROW, clips },
      ...built.tracks.map((track) => ({ ...track, index: track.index + 1 })),
    ],
    seconds: outro ? (meetF + outroF) / fps : built.seconds,
    finished: [
      ...(bug ? ['its logo bug over the recording'] : []),
      ...(outro ? ['its outro'] : []),
    ],
  };
}
