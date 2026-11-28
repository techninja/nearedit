/**
 * What a score says about itself: the summary line and the notes on how
 * the tempo was fitted, where the sections fell, what the song is made of
 * and how it was ducked.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The result.
 * @module api/director/score/notes
 */

import { clock, pointName } from '#utils/director/score/digest.js';
import { formatSeconds } from '#utils/director/snap.js';
import { SCALES } from '#utils/music/theory/scales.js';

/** @typedef {import('#utils/director/score/fit.js').Fit} Fit */

const round = (/** @type {number} */ value, digits = 2) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const count = (/** @type {number} */ n, /** @type {string} */ thing) =>
  `${n} ${thing}${n === 1 ? '' : 's'}`;
const stretches = (/** @type {number} */ n) => (n === 1 ? '1 stretch' : `${n} stretches`);

/**
 * How the tempo came about.
 * @param {Fit} fit
 * @param {import('#utils/director/score/style.js').Style} style
 * @param {number} seconds - Length of the span
 * @returns {string}
 */
export function tempoNote(fit, style, seconds) {
  const bpm = `${round(fit.bpm)} BPM`;
  const range = `${style.bpm[0]}–${style.bpm[1]} BPM`;
  const length = formatSeconds(seconds);
  const rest = `${round(fit.rest, 1)}s`;
  const bars = count(fit.bars, 'bar');
  if (fit.exact === 'bars') {
    return `${bpm} makes the ${length} exactly ${bars} of ${fit.beatsPerBar} (${style.label} plays at ${range}).`;
  }
  if (fit.exact === 'beats') {
    const beats = Math.round((seconds * fit.bpm) / 60);
    return (
      `No tempo of ${style.label} (${range}) makes ${length} a whole number of bars; at ${bpm} ` +
      `it is ${beats} beats: ${bars}, and the last chord rings for the ${rest} left.`
    );
  }
  if (fit.exact === 'asked') {
    return fit.rest < 0.05
      ? `At the ${bpm} asked for, the ${length} are ${bars}.`
      : `At the ${bpm} asked for, the music ends after ${bars} and rings out for the ${rest} left of the ${length}.`;
  }
  return fit.rest > 30
    ? `A song has at most ${fit.bars} bars: at ${bpm} the music covers ${formatSeconds(fit.seconds)} of the ${length}.`
    : `${length} is too short for the tempos of ${style.label} (${range}): ${bars} at ${bpm}, cut to length.`;
}

/**
 * Where the sections fell, and on which turning points.
 * @param {import('#utils/director/score/sections.js').Section[]} sections
 * @param {number} barSeconds
 * @param {import('#utils/director/score/sections.js').TurningPoint[]} points
 * @returns {string[]}
 */
export function sectionNotes(sections, barSeconds, points) {
  const reach = barSeconds / 2 + 1e-6;
  const starts = sections.slice(1).map((section) => section.from * barSeconds);
  /** The turning point a section begins on: the nearest within half a bar. */
  const on = (/** @type {number} */ at) =>
    points
      .filter((point) => Math.abs(point.time - at) <= reach)
      .sort((a, b) => Math.abs(a.time - at) - Math.abs(b.time - at) || b.weight - a.weight)[0];
  const parts = sections.map((section) => {
    const at = section.from * barSeconds;
    const near = section.from > 0 ? on(at) : undefined;
    if (!near) return `${section.name} ${clock(at)}`;
    const off = at - near.time;
    const away =
      Math.abs(off) < 0.05
        ? ''
        : `, ${round(Math.abs(off), 1)}s ${off > 0 ? 'after' : 'before'} it`;
    return `${section.name} ${clock(at)} (${pointName(near)}${away})`;
  });
  const notes = [`Sections: ${parts.join(' · ')}.`];
  const left = points.filter((point) => starts.every((at) => Math.abs(point.time - at) > reach));
  if (left.length) {
    notes.push(
      `${count(left.length, 'turning point')} of the timeline ${left.length === 1 ? 'lies' : 'lie'} ` +
        'inside a section: too close to another one, or to an end, to begin its own.',
    );
  }
  return notes;
}

/**
 * What the song is made of.
 * @param {any} song - As generated
 * @param {import('#utils/director/score/harmony.js').Harmony} harmony
 * @returns {string}
 */
export function songNote(song, harmony) {
  const scale = SCALES[harmony.scale]?.label.toLowerCase() || harmony.scale;
  const names = song.parts.map((/** @type {any} */ part) => part.name).join(', ');
  return (
    `${harmony.key} ${scale}, ${harmony.numerals.replace(/-/g, ' – ')}, ending on ` +
    `${harmony.turn.name} – ${harmony.tonic.name}. ${count(song.parts.length, 'part')}: ${names}.`
  );
}

/**
 * How the clip was ducked.
 * @param {{ duck: number, speech: import('./speech.js').Heard,
 *   ducked: import('#utils/director/score/duck.js').Span[] }} input
 * @returns {string[]}
 */
export function duckNotes({ duck, speech, ducked }) {
  if (!speech.spans.length) return ['No speech was found in the span: the music keeps its level.'];
  if (!(duck > 0)) return [...speech.notes, 'Ducking is off (0 dB): the music keeps its level.'];
  const share = Math.round(speech.spoken * 100);
  return [
    ...speech.notes,
    `The music drops by ${duck} dB under ${stretches(ducked.length)} of speech ` +
      `(${share}% of the span) and comes back in the gaps: volume keyframes on the clip.`,
  ];
}
