/**
 * A song as a small picture for a tile: its notes as lines by pitch, its
 * drum hits as dots by drum — the picture the timeline draws on a music
 * clip (`songPicture`), as an SVG string for `innerHTML`. Pure.
 * @module utils/musicUi/songSvg
 */

import { DRUM_NAMES } from '#utils/music/catalog/drums.js';
import { musicSeconds } from '#utils/music/timing.js';
import { songPicture } from '#utils/timeline/clipMarksMusic.js';

const WIDTH = 120;
const HEIGHT = 44;
/** Share of the height the drums take when there are notes above them. */
const DRUM_SHARE = 0.42;

/** @type {(value: number) => string} A coordinate, short */
const at = (value) => String(Math.round(value * 10) / 10);

/**
 * @param {any} song - Normalised
 * @returns {string} An `<svg>` element, drawn in `currentColor`
 */
export function songSvg(song) {
  const { hits, notes, low, high } = songPicture(song);
  const seconds = musicSeconds(song) || 1;
  const x = (/** @type {number} */ time) => (time / seconds) * WIDTH;
  const drums = hits.length ? (notes.length ? HEIGHT * DRUM_SHARE : HEIGHT) : 0;
  const row = drums / DRUM_NAMES.length;
  const span = Math.max(11, high - low);
  const room = HEIGHT - drums - 3;
  const marks = [
    ...notes.map(([time, length, pitch]) => {
      const y = 1 + (1 - (pitch - low) / span) * (room - 2);
      const width = Math.max(1.5, x(Math.min(seconds, time + length)) - x(time) - 0.6);
      return `<rect x="${at(x(time))}" y="${at(y)}" width="${at(width)}" height="2"/>`;
    }),
    ...hits.map(([time, drum]) => {
      const y = HEIGHT - drums + drum * row;
      return `<rect x="${at(x(time))}" y="${at(y)}" width="2" height="${at(Math.max(1.6, row - 0.4))}"/>`;
    }),
  ];
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" fill="currentColor" aria-hidden="true">${marks.join('')}</svg>`;
}
