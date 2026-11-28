/**
 * A drum part playing: one voice per drum of its kit, struck as the song
 * reaches each step. A drum hit again while it still rings starts over, the
 * old hit faded out through the spill; a closed hat chokes the open one.
 * Isomorphic; no state outside the instance.
 * @module utils/music/engine/drums
 */

import { CHOKES, DRUM_NAMES } from '#utils/music/catalog/drums.js';
import { DEFAULT_KIT, KITS } from '#utils/music/catalog/kits.js';
import { loopEvents } from '#utils/music/unroll.js';
import { compileDrum } from './drumPatch.js';
import { DrumVoice } from './drumVoice.js';
import { Cursor } from './schedule.js';
import { SPILL, Spill } from './spill.js';

export class DrumPart {
  /**
   * @param {any} song - Normalised
   * @param {any} part - A normalised drum part
   * @param {number} sampleRate
   * @param {number} index - Place of the part in the song, for its seeds
   * @param {number} block - The most samples one `render` is asked for
   */
  constructor(song, part, sampleRate, index, block) {
    const kit = KITS[part.kit] || KITS[DEFAULT_KIT];
    const size = Math.max(block, SPILL);
    /** @type {(DrumVoice|null)[]} One per drum, for the drums the part hits */
    this.voices = DRUM_NAMES.map((name) =>
      part.lanes[name]
        ? new DrumVoice(compileDrum(kit.drums[name], sampleRate), sampleRate, size)
        : null,
    );
    this.cursor = new Cursor(song, part, loopEvents(song, part), sampleRate);
    this.spill = new Spill();
    this.index = index;
    this.count = 0;
    this.chokes = DRUM_NAMES.map((name) => DRUM_NAMES.indexOf(CHOKES[name]));
  }

  /**
   * Strike the drum the cursor is at.
   * @param {number} now
   */
  hit(now) {
    const [, drum, velocity] = this.cursor.event;
    const voice = this.voices[drum];
    this.voices[this.chokes[drum]]?.choke();
    if (voice.active) {
      this.spill.take(now, (left, right) => {
        voice.render(left, right, 0, SPILL);
        return SPILL;
      });
    }
    voice.strike(velocity, (this.index + 1) * 1000003 + this.count++);
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
      while (cursor.at <= pos + i) {
        this.hit(pos + i);
        cursor.next();
      }
      const end = Math.min(count, cursor.at - pos);
      for (const voice of voices) {
        if (!voice?.active) continue;
        voice.render(left, right, i, end - i);
        heard = true;
      }
      i = end;
    }
    return this.spill.mix(left, right, pos, count) || heard;
  }
}
