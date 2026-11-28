/**
 * When a part's events fall, in samples. A part is a loop that plays in
 * some bars of the song (`playRanges`); a cursor walks its events in order
 * without ever listing them all, so a twenty-minute song costs no more
 * memory than one bar. Every event lands on the exact sample its beat
 * rounds to. Isomorphic and pure.
 * @module utils/music/engine/schedule
 */

import { playRanges, songFrame, swingBeat } from '#utils/music/timing.js';

/**
 * One event of a part's loop: for a drum hit `[beat, drum, velocity]`, for
 * a note `[beat, pitch, velocity, length]`. Beats count from the loop's start.
 * @typedef {number[]} LoopEvent
 */

export class Cursor {
  /**
   * @param {any} song - Normalised
   * @param {any} part - Normalised
   * @param {LoopEvent[]} events - Sorted by beat
   * @param {number} sampleRate
   */
  constructor(song, part, events, sampleRate) {
    const { bpm, beatsPerBar, bars, swing } = songFrame(song);
    this.events = events;
    this.swing = swing;
    this.perBeat = (60 / bpm) * sampleRate;
    this.loop = part.bars * beatsPerBar;
    this.ranges = playRanges(song, part).map(([from, to]) => [
      from * beatsPerBar,
      to * beatsPerBar,
    ]);
    /** The last sample of the music: nothing is held past it. */
    this.end = this.sampleOf(bars * beatsPerBar);
    this.range = 0;
    this.index = 0;
    this.base = this.ranges.length ? this.ranges[0][0] : 0;
    /** Sample of the next event; Infinity when there is none. */
    this.at = Infinity;
    /** The next event, and the beat of the song it falls on. */
    this.event = events[0];
    this.beat = 0;
    this.seek();
  }

  /**
   * @param {number} beat - Beats from the start of the song
   * @returns {number} The sample it is played at, swing included
   */
  sampleOf(beat) {
    return Math.round(swingBeat(beat, this.swing) * this.perBeat);
  }

  /** Find the next event at or after the current place. */
  seek() {
    const { events, ranges, loop } = this;
    while (events.length && this.range < ranges.length) {
      if (this.index >= events.length) {
        this.index = 0;
        this.base += loop;
      }
      const beat = this.base + events[this.index][0];
      if (beat < ranges[this.range][1] - 1e-9) {
        this.event = events[this.index];
        this.beat = beat;
        this.at = this.sampleOf(beat);
        return;
      }
      this.range++;
      this.index = 0;
      this.base = this.range < ranges.length ? ranges[this.range][0] : 0;
    }
    this.at = Infinity;
  }

  /** Step to the event after the current one. */
  next() {
    this.index++;
    this.seek();
  }

  /**
   * @param {number} length - Beats the current event lasts
   * @returns {number} The sample it ends at: after it starts, and never
   *   after the music does
   */
  endOf(length) {
    return Math.max(this.at + 1, Math.min(this.end, this.sampleOf(this.beat + length)));
  }
}
