/**
 * Reading one track of a MIDI file. Isomorphic and pure.
 * @module utils/music/midi/track
 */

/** @typedef {import('./parse.js').Midi} Midi */

/** Data bytes that follow each kind of channel message (status 8x … Ex). */
const DATA = [2, 2, 2, 2, 1, 1, 2];
/** Data bytes that follow the system messages F1 … F6. */
const SYSTEM = { 0xf1: 1, 0xf2: 2, 0xf3: 1 };

/**
 * A number of variable length: seven bits per byte, the top bit says more follows.
 * @param {Uint8Array} bytes
 * @param {{ at: number }} cursor - Moved past the number
 * @param {number} end
 * @returns {number}
 */
function variable(bytes, cursor, end) {
  let value = 0;
  for (let i = 0; i < 4 && cursor.at < end; i++) {
    const byte = bytes[cursor.at++];
    value = value * 128 + (byte & 0x7f);
    if (byte < 0x80) break;
  }
  return value;
}

/**
 * A meta event: tempo, time signature, the track's name.
 * @param {Uint8Array} bytes
 * @param {number} kind
 * @param {number} at - Where its data starts
 * @param {number} length
 * @param {number} tick
 * @param {Midi} midi
 * @param {{ name: string }} track
 */
function meta(bytes, kind, at, length, tick, midi, track) {
  if (kind === 0x51 && length >= 3) {
    const micros = (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2];
    if (micros > 0) midi.tempos.push({ tick, bpm: 60000000 / micros });
  } else if (kind === 0x58 && length >= 2) {
    midi.signatures.push({
      tick,
      numerator: bytes[at],
      denominator: 1 << Math.min(6, bytes[at + 1]),
    });
  } else if (kind === 0x03 && !track.name) {
    const text = String.fromCharCode(...bytes.subarray(at, at + Math.min(length, 80)));
    track.name = text.replace(/[^\x20-\x7e]/g, '').trim();
  }
}

/**
 * Read a track's events into a file's notes, tempos and signatures.
 * @param {Uint8Array} bytes
 * @param {number} from
 * @param {number} end
 * @param {Midi} midi - Added to
 */
export function readTrack(bytes, from, end, midi) {
  const index = midi.tracks.length;
  const track = { name: '' };
  midi.tracks.push(track);
  const cursor = { at: from };
  const programs = new Array(16).fill(0);
  /** @type {Map<number, import('./parse.js').MidiNote[]>} Notes that are held, by channel and pitch */
  const held = new Map();
  let tick = 0;
  let status = 0;
  const release = (key) => {
    const note = held.get(key)?.shift();
    if (note) note.ticks = Math.max(1, tick - note.tick);
  };
  while (cursor.at < end) {
    tick += variable(bytes, cursor, end);
    if (cursor.at >= end) break;
    // Data bytes with no message to belong to are stray: on to the next message.
    while (status < 0x80 && cursor.at < end && bytes[cursor.at] < 0x80) cursor.at++;
    if (cursor.at >= end) break;
    if (bytes[cursor.at] >= 0x80) status = bytes[cursor.at++];
    if (status === 0xff) {
      const kind = bytes[cursor.at++];
      const length = variable(bytes, cursor, end);
      if (kind === 0x2f) break;
      meta(bytes, kind, cursor.at, Math.min(length, end - cursor.at), tick, midi, track);
      cursor.at += length;
      status = 0;
    } else if (status === 0xf0 || status === 0xf7) {
      const length = variable(bytes, cursor, end);
      cursor.at += length;
      status = 0;
    } else if (status >= 0xf0) {
      cursor.at += SYSTEM[status] ?? 0;
      status = 0;
    } else {
      const kind = status >> 4;
      const channel = status & 15;
      const a = bytes[cursor.at] & 0x7f;
      const b = bytes[cursor.at + 1] & 0x7f;
      cursor.at += DATA[kind - 8];
      if (cursor.at > end) break;
      const key = channel * 128 + a;
      if (kind === 0xc) programs[channel] = a;
      else if (kind === 8 || (kind === 9 && b === 0)) release(key);
      else if (kind === 9) {
        const note = { track: index, channel, pitch: a, velocity: b, tick, ticks: 0 };
        held.set(key, [...(held.get(key) || []), { ...note, program: programs[channel] }]);
        midi.notes.push(held.get(key)[held.get(key).length - 1]);
      }
    }
  }
  // A note that is never let go lasts until its track ends.
  for (const key of held.keys()) while (held.get(key).length) release(key);
}
