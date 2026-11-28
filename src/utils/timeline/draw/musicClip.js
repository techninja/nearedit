/**
 * What the timeline draws on a music clip: ticks where its bars (and,
 * zoomed in, its beats) begin; a small picture of the song — notes as
 * short lines by pitch, drum hits as dots by drum — in the upper part of
 * its body, with the waveform of its rendering below once there is one;
 * hatching until the first rendering; and a mark at the right of the label
 * while a rendering is on its way or has failed.
 * @module utils/timeline/draw/musicClip
 */

import { firstAt, musicLines, musicMark, songPicture } from '#utils/timeline/clipMarksMusic.js';
import { timeToX, xToTimeRaw } from '#utils/timeline/viewport.js';
import { drawWaveform } from './clipContent.js';
import { hatch } from './shapes.js';

/** @typedef {import('./scene.js').Scene} Scene */
/** @typedef {{ x0: number, x1: number, y: number, height: number }} ClipBox */

const LABEL_H = 15;
/** A body shorter than this shows the picture only. */
const SPLIT_MIN = 44;
const MARKS = { rendering: 'rendering…', failed: 'not rendered', stale: 'out of date' };
const MARK_PAD = 5;

/**
 * Bar and beat ticks, the notes and the drum hits of the part of the song
 * that is on screen.
 * @param {Scene} scene
 * @param {any} clip
 * @param {{ left: number, right: number, top: number, height: number }} area
 */
function drawPicture(scene, clip, { left, right, top, height }) {
  const { ctx, vp, palette } = scene;
  const { song } = clip.music;
  /** @type {(x: number) => number} Canvas x → seconds into the song */
  const toSong = (x) => clip.sourceIn + (xToTimeRaw(vp, x) - clip.timelineStart);
  /** @type {(time: number) => number} Seconds into the song → canvas x */
  const xOf = (time) => timeToX(vp, clip.timelineStart + (time - clip.sourceIn));
  const from = Math.max(clip.sourceIn, toSong(left));
  const to = Math.min(clip.sourceOut, toSong(right));
  ctx.fillStyle = palette.clipText;
  ctx.globalAlpha = 0.45;
  for (const line of musicLines(song, from, to, vp.pps)) {
    ctx.fillRect(Math.round(xOf(line.time)), top, 1, line.bar ? Math.min(7, height) : 3);
  }
  const picture = songPicture(song);
  // Drums take the foot of the body — all of it in a song without notes.
  const share = picture.notes.length ? 0.45 : 1;
  const row = Math.min(6, (height * share - 9 * share) / Math.max(1, picture.rows));
  const drums = picture.rows * row;
  const span = Math.max(11, picture.high - picture.low);
  const room = height - drums - 9;
  ctx.globalAlpha = 0.9;
  for (let i = firstAt(picture.notes, from - picture.longest); i < picture.notes.length; i++) {
    const [time, length, pitch] = picture.notes[i];
    if (time > to) break;
    const x = Math.max(left, xOf(time));
    const end = Math.min(right, xOf(Math.min(clip.sourceOut, time + length)));
    const y = top + 8 + (1 - (pitch - picture.low) / span) * Math.max(0, room - 2);
    if (end > x && room > 3) ctx.fillRect(x, Math.round(y), Math.max(1.5, end - x - 0.5), 2);
  }
  for (let i = firstAt(picture.hits, from); i < picture.hits.length; i++) {
    const [time, drum] = picture.hits[i];
    if (time >= to) break;
    ctx.fillRect(xOf(time), top + height - drums + drum * row, 2.5, Math.max(1.5, row - 1));
  }
  ctx.globalAlpha = 1;
}

/**
 * The body of a music clip.
 * @param {Scene} scene
 * @param {any} clip
 * @param {ClipBox} box
 * @param {boolean} rendered - The clip has a rendering to show the waveform of
 */
export function drawMusicBody(scene, clip, box, rendered) {
  const { ctx, vp, palette } = scene;
  const left = Math.max(box.x0, 0);
  const right = Math.min(box.x1, vp.width);
  const top = box.y + LABEL_H;
  const height = box.height - LABEL_H - 2;
  if (!rendered) {
    ctx.strokeStyle = palette.clipText;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.16;
    const anchored = box.x0 + Math.floor((Math.max(box.x0, -16) - box.x0) / 9) * 9;
    hatch(ctx, anchored, box.y, right + 16 - anchored, box.height, 9, -1);
    ctx.globalAlpha = 1;
  }
  if (height < 8 || right <= left) return;
  const split = rendered && height >= SPLIT_MIN;
  const upper = split ? Math.round(height * 0.55) : height;
  drawPicture(scene, clip, { left, right, top, height: upper });
  if (split) drawWaveform(scene, clip, { ...box, y: top + upper, height: height - upper + 2 });
}

/**
 * The mark of a music clip whose rendering is on its way, failed, or is
 * not being made: its words when they fit, else a dot.
 * @param {Scene} scene
 * @param {any} clip
 * @param {ClipBox} box
 * @param {number} taken - Pixels at the right end already used (the "fx" badge)
 * @returns {number} Pixels the mark takes from the label's room; 0 = none drawn
 */
export function drawMusicMark(scene, clip, box, taken) {
  const mark = musicMark(clip);
  const width = box.x1 - box.x0;
  if (!mark || width < 26) return 0;
  const { ctx, palette, vp } = scene;
  ctx.font = `bold 9px ${palette.sans}`;
  const text = MARKS[mark];
  const wide = width >= 150 ? Math.ceil(ctx.measureText(text).width) + 2 * MARK_PAD : 11;
  const x = Math.min(box.x1, vp.width + 8) - taken - wide - 3;
  ctx.fillStyle = mark === 'rendering' ? 'rgb(0 0 0 / 40%)' : palette.warning;
  ctx.beginPath();
  ctx.roundRect(x, box.y + 2, wide, 11, wide > 11 ? 3 : 5.5);
  ctx.fill();
  if (wide > 11) {
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.clipText;
    ctx.fillText(text, x + MARK_PAD, box.y + 8);
  }
  return wide + 5;
}
