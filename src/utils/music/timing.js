/**
 * When things happen in a song: its length, where its beats and bars fall,
 * how swing moves the steps between them, and where a part sounds. Every
 * function reads the tempo fields through the same bounds the normaliser
 * uses, so it is safe on a song that was never normalised. Isomorphic and pure.
 * @module utils/music/timing
 */

import { numberIn, own, record } from '#utils/web/coerce.js';
import { SONG_LIMITS as LIMITS, defaultSong } from './limits.js';

/** @typedef {{ bpm: number, beatsPerBar: number, bars: number, swing: number, tail: number }} Frame */

/**
 * The fields that decide a song's timing, each inside its range. `bars` is
 * also kept short enough for the whole song, tail included, to last at most
 * 20 minutes.
 * @param {any} song
 * @returns {Frame}
 */
export function songFrame(song) {
  const from = record(song);
  const base = defaultSong();
  const read = (name, integer) =>
    numberIn(own(from, name), base[name], LIMITS[name][0], LIMITS[name][1], integer);
  const bpm = read('bpm');
  const beatsPerBar = read('beatsPerBar', true);
  const tail = read('tail');
  const fit = Math.floor(((LIMITS.seconds - tail) * bpm) / (60 * beatsPerBar) + 1e-9);
  const bars = Math.max(1, Math.min(read('bars', true), fit));
  return { bpm, beatsPerBar, bars, swing: read('swing'), tail };
}

/**
 * @param {any} song
 * @returns {number} Seconds of music: bars × beats × 60 / bpm
 */
export function musicSeconds(song) {
  const { bpm, beatsPerBar, bars } = songFrame(song);
  return (bars * beatsPerBar * 60) / bpm;
}

/**
 * @param {any} song
 * @returns {number} Seconds of the whole song: the music and its tail
 */
export function songSeconds(song) {
  return musicSeconds(song) + songFrame(song).tail;
}

/**
 * Swing: inside every eighth note the sixteenth in the middle falls late by
 * `swing` sixteenths, and everything else keeps its place between them — so
 * eighths stay where they are and any finer grid swings along.
 * @param {number} beat - Beats from the start of the song
 * @param {number} swing - 0 … 0.75
 * @returns {number} The beat at which it is played
 */
export function swingBeat(beat, swing) {
  if (!(swing > 0)) return beat;
  const pair = Math.floor(beat * 2) / 2;
  const within = beat - pair;
  const late = within < 0.25 ? within * (1 + swing) : 0.25 * (1 + swing) + (within - 0.25) * (1 - swing);
  return pair + late;
}

/**
 * @param {any} song
 * @param {number} beat - Beats from the start of the song
 * @returns {number} The second it is played at, swing included
 */
export function beatSeconds(song, beat) {
  const { bpm, swing } = songFrame(song);
  return (swingBeat(beat, swing) * 60) / bpm;
}

/**
 * @param {any} song
 * @returns {number[]} The second of every bar line, the one that ends the
 *   music included: `bars + 1` times
 */
export function barTimes(song) {
  const { bpm, beatsPerBar, bars } = songFrame(song);
  return Array.from({ length: bars + 1 }, (_, bar) => (bar * beatsPerBar * 60) / bpm);
}

/**
 * @param {any} song
 * @returns {number[]} The second of every beat, and of the end of the music
 */
export function beatTimes(song) {
  const { bpm, beatsPerBar, bars } = songFrame(song);
  return Array.from({ length: bars * beatsPerBar + 1 }, (_, beat) => (beat * 60) / bpm);
}

/**
 * Where the steps of a grid fall, swing included — what a drum lane's
 * characters are played at.
 * @param {any} song
 * @param {number} [steps=16] - Steps per bar
 * @returns {number[]} The second of every step of the song: `bars × steps` times
 */
export function stepTimes(song, steps = 16) {
  const { bpm, beatsPerBar, bars, swing } = songFrame(song);
  const perBar = Math.max(1, Math.min(96, Math.round(steps) || 16));
  return Array.from({ length: bars * perBar }, (_, step) => {
    return (swingBeat((step * beatsPerBar) / perBar, swing) * 60) / bpm;
  });
}

/**
 * The bars in which a part sounds, as ranges inside the song: its `play`
 * list, or the whole song when that is empty. A part's loop starts again at
 * the beginning of every range.
 * @param {any} song
 * @param {any} part
 * @returns {number[][]} `[from, to]` in bars, `to` not included, in order
 */
export function playRanges(song, part) {
  const { bars } = songFrame(song);
  const play = own(record(part), 'play');
  const given = Array.isArray(play) ? play : [];
  const ranges = given
    .filter((range) => Array.isArray(range) && range[0] < bars && range[1] > range[0])
    .map(([from, to]) => [Math.max(0, from), Math.min(bars, to)]);
  return given.length ? ranges : [[0, bars]];
}
