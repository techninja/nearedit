/**
 * Writing a song as a Standard MIDI File (format 1, 480 ticks per quarter
 * note): a first track with the tempo and the time signature, then a track
 * per part with its loop written out along the song — drums on channel 10
 * as General MIDI percussion, synths with a program that stands for their
 * preset. Swing is not written: notes sit on the grid they were drawn on.
 * Isomorphic and pure.
 * @module utils/music/midi/export
 */

import { DRUM_NAMES } from '#utils/music/catalog/drums.js';
import { LANE_VELOCITIES } from '#utils/music/lanes.js';
import { normalizeSong } from '#utils/music/normalize.js';
import { partLabel } from '#utils/music/label.js';
import { unrollPart } from '#utils/music/unroll.js';
import { DRUM_CHANNEL, DRUM_NOTES, PRESET_PROGRAMS } from './gm.js';
import { named, text, track, u32 } from './write.js';

/** Ticks per quarter note of a written file. */
export const TICKS = 480;
/** Ticks a drum hit is held. */
const HIT = 60;

/**
 * The events of one part.
 * @param {any} song - Normalised
 * @param {any} part
 * @param {number} channel
 * @returns {{ tick: number, bytes: number[] }[]}
 */
function partEvents(song, part, channel) {
  const end = song.bars * song.beatsPerBar * TICKS;
  const events = [named(partLabel(part))];
  if (part.kind === 'synth')
    events.push({ tick: 0, bytes: [0xc0 | channel, PRESET_PROGRAMS[part.preset]] });
  /** @type {{ tick: number, bytes: number[] }[]} */
  const offs = [];
  for (const [beat, a, velocity, length] of unrollPart(song, part)) {
    const tick = Math.round(beat * TICKS);
    const drum = part.kind === 'drums';
    const pitch = drum ? DRUM_NOTES[DRUM_NAMES[a]] : Math.min(127, Math.max(0, a + part.transpose));
    // A drum's three strengths are written so that they read back as the same three.
    const loud = drum
      ? velocity >= LANE_VELOCITIES.X
        ? 127
        : velocity >= LANE_VELOCITIES.x
          ? 95
          : 50
      : 0;
    const until = drum ? tick + HIT : Math.round((beat + length) * TICKS);
    events.push({
      tick,
      bytes: [0x90 | channel, pitch, loud || Math.max(1, Math.round(velocity * 127))],
    });
    offs.push({
      tick: Math.max(tick + 1, Math.min(end, until)),
      bytes: [0x80 | channel, pitch, 0],
    });
  }
  // Ends are written before the starts that fall on the same tick.
  return [...offs, ...events];
}

/**
 * Write a song as a MIDI file.
 * @param {any} song - Normalised here. Muted parts are left out
 * @returns {Uint8Array}
 */
export function songToMidi(song) {
  const normal = normalizeSong(song);
  const micros = Math.round(60000000 / normal.bpm);
  const conductor = track([
    named('NearEdit song'),
    { tick: 0, bytes: [0xff, 0x51, 3, (micros >> 16) & 255, (micros >> 8) & 255, micros & 255] },
    { tick: 0, bytes: [0xff, 0x58, 4, normal.beatsPerBar, 2, 24, 8] },
  ]);
  const chunks = [conductor];
  let next = 0;
  for (const part of normal.parts.filter((entry) => !entry.mute)) {
    // Synths take the channels in turn, stepping over the drum channel.
    const channel = part.kind === 'drums' ? DRUM_CHANNEL : next++ % 15;
    chunks.push(
      track(
        partEvents(
          normal,
          part,
          channel >= DRUM_CHANNEL && part.kind !== 'drums' ? channel + 1 : channel,
        ),
      ),
    );
  }
  const header = [
    ...text('MThd'),
    ...u32(6),
    0,
    1,
    chunks.length >> 8,
    chunks.length & 255,
    TICKS >> 8,
    TICKS & 255,
  ];
  return Uint8Array.from([header, ...chunks].flat());
}
