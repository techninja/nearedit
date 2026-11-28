/**
 * A synth part playing: its notes handed to voices as the song reaches
 * them. A part has as many voices as its `voices` parameter; when all are
 * busy the oldest gives way (released ones first), its last milliseconds
 * faded out through the spill so nothing clicks. With one voice the part is
 * a mono synth: notes that overlap slide into each other (legato).
 * Isomorphic; no state outside the instance.
 * @module utils/music/engine/synth
 */

import { Cursor } from './schedule.js';
import { SPILL, Spill } from './spill.js';
import { TICK, compilePatch } from './synthPatch.js';
import { Voice } from './voice.js';
import { control, startVoice, strike } from './voiceControl.js';

export class SynthPart {
  /**
   * @param {any} song - Normalised
   * @param {any} part - A normalised synth part
   * @param {number} sampleRate
   * @param {number} index - Place of the part in the song, for its seeds
   */
  constructor(song, part, sampleRate, index) {
    this.patch = compilePatch(part, sampleRate);
    const events = part.notes.map(([beat, length, pitch, velocity]) => [beat, pitch, velocity, length]);
    this.cursor = new Cursor(song, part, events, sampleRate);
    this.voices = Array.from({ length: this.patch.voices }, () => new Voice(this.patch));
    this.spill = new Spill();
    this.index = index;
    this.count = 0;
    this.last = NaN;
  }

  /**
   * @returns {Voice} A voice for a new note: a free one, else the oldest
   *   released one, else the oldest
   */
  pick() {
    let found = this.voices[0];
    for (const voice of this.voices) {
      if (!voice.active) return voice;
      const better = found.gate === voice.gate ? voice.started < found.started : !voice.gate;
      if (better) found = voice;
    }
    return found;
  }

  /**
   * Fade a voice out through the spill and free it.
   * @param {Voice} voice
   * @param {number} now
   */
  cut(voice, now) {
    if (voice.started < now) {
      this.spill.take(now, (left, right) => {
        let done = 0;
        while (done < SPILL && voice.active) {
          const at = now + done;
          // On a tick the voice is set up here: the part has not yet done it.
          if (at % TICK === 0) control(voice, at, TICK);
          const span = Math.min(SPILL - done, TICK - (at % TICK));
          if (voice.active) voice.render(left, right, done, span);
          done += span;
        }
        return done;
      });
    }
    voice.active = false;
  }

  /**
   * Start the note the cursor is at.
   * @param {number} now
   */
  noteOn(now) {
    const [, pitch, velocity, length] = this.cursor.event;
    const off = this.cursor.endOf(length);
    const span = TICK - (now % TICK);
    const mono = this.voices.length === 1;
    const voice = this.pick();
    const from = this.patch.glide < 1 && !Number.isNaN(this.last) ? this.last : pitch;
    this.last = pitch;
    this.count++;
    if (mono && voice.active) {
      // The change is heard from the next tick on, at most a third of a millisecond later.
      strike(voice, pitch, velocity, off, voice.gate && voice.offAt > now);
      return;
    }
    if (voice.active) this.cut(voice, now);
    startVoice(voice, pitch, velocity, now, off, this.index * 65536 + this.count, from);
    if (now % TICK !== 0) control(voice, now, span);
  }

  /**
   * Add `count` samples of the part to a stereo pair of buffers.
   * @param {Float64Array} left
   * @param {Float64Array} right
   * @param {number} pos - Sample of the song the buffers start at
   * @param {number} count
   * @returns {boolean} True when the part made any sound
   */
  render(left, right, pos, count) {
    const { cursor, voices } = this;
    let heard = false;
    for (let i = 0; i < count; ) {
      const now = pos + i;
      while (cursor.at <= now) {
        this.noteOn(now);
        cursor.next();
      }
      if (now % TICK === 0) for (const voice of voices) if (voice.active) control(voice, now, TICK);
      const end = Math.min(count, i + TICK - (now % TICK), cursor.at - pos);
      for (const voice of voices) {
        if (!voice.active) continue;
        voice.render(left, right, i, end - i);
        heard = true;
      }
      i = end;
    }
    return this.spill.mix(left, right, pos, count) || heard;
  }
}
