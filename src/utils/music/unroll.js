/**
 * A part written out along the song: its loop repeated in every bar range
 * where it sounds. What the engine walks one event at a time, as a list —
 * for MIDI export and for editors that draw a whole part. Isomorphic and pure.
 * @module utils/music/unroll
 */

import { DRUM_NAMES } from './catalog/drums.js';
import { laneVelocities } from './lanes.js';
import { playRanges, songFrame } from './timing.js';

/**
 * The events of a part's loop: for a drum part `[beat, drum, velocity]`
 * (drum as its place in `DRUM_NAMES`), for a synth part
 * `[beat, pitch, velocity, length]`. Beats count from the loop's start.
 * @param {any} song - Normalised
 * @param {any} part - A normalised part
 * @returns {number[][]} In order of beat
 */
export function loopEvents(song, part) {
  if (part.kind !== 'drums') {
    return part.notes.map(([beat, length, pitch, velocity]) => [beat, pitch, velocity, length]);
  }
  /** @type {number[][]} */
  const events = [];
  DRUM_NAMES.forEach((name, drum) => {
    laneVelocities(part.lanes[name] || '').forEach((velocity, step) => {
      if (velocity > 0) events.push([(step * song.beatsPerBar) / part.steps, drum, velocity]);
    });
  });
  return events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/**
 * Every event a part plays in the song, without swing.
 * @param {any} song - Normalised
 * @param {any} part - A normalised part
 * @param {number} [most=100000] - Events after which the list is cut
 * @returns {number[][]} Like `loopEvents`, the beat counted from the start
 *   of the song
 */
export function unrollPart(song, part, most = 100000) {
  const { beatsPerBar } = songFrame(song);
  const events = loopEvents(song, part);
  const loop = part.bars * beatsPerBar;
  /** @type {number[][]} */
  const out = [];
  for (const [from, to] of playRanges(song, part)) {
    for (let base = from * beatsPerBar; base < to * beatsPerBar && events.length; base += loop) {
      for (const event of events) {
        if (base + event[0] >= to * beatsPerBar - 1e-9 || out.length >= most) break;
        out.push([base + event[0], ...event.slice(1)]);
      }
    }
  }
  return out;
}
