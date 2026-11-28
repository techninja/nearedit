/**
 * Voice leading: placing the notes of each chord so that the hands barely
 * move from the chord before — notes the two chords share stay where they
 * are, the others go to the nearest place. Isomorphic and pure.
 * @module utils/music/theory/voicing
 */

/** @typedef {import('./chords.js').Chord} Chord */

/**
 * Every close voicing of a chord around a centre: each inversion, in the
 * three octaves nearest to it.
 * @param {Chord} chord
 * @param {number} center - MIDI note the voicing should sit around
 * @returns {number[][]} Each ascending
 */
function voicings(chord, center) {
  const classes = [...new Set(chord.steps.map((step) => (chord.root + step) % 12))];
  const found = [];
  for (let turn = 0; turn < classes.length; turn++) {
    for (const octave of [-1, 0, 1]) {
      const lowest = classes[turn] + 12 * (Math.round((center - 6 - classes[turn]) / 12) + octave);
      const notes = [lowest];
      for (let i = 1; i < classes.length; i++) {
        const above = classes[(turn + i) % classes.length];
        const last = notes[notes.length - 1];
        notes.push(last + ((((above - last) % 12) + 12) % 12 || 12));
      }
      if (notes[0] >= 0 && notes[notes.length - 1] <= 127) found.push(notes);
    }
  }
  return found;
}

/**
 * @param {number[]} from
 * @param {number[]} to
 * @returns {number} How far every note of one voicing is from the nearest of the other
 */
function distance(from, to) {
  const nearest = (note, others) => Math.min(...others.map((other) => Math.abs(other - note)));
  const there = to.reduce((sum, note) => sum + nearest(note, from), 0);
  return there + from.reduce((sum, note) => sum + nearest(note, to), 0);
}

/**
 * Voice a chord sequence.
 * @param {Chord[]} chords
 * @param {{ center?: number }} [opts] - `center`: the MIDI note the chords
 *   stay around (default middle C, 60)
 * @returns {number[][]} The notes of each chord, ascending
 */
export function voiceLead(chords, opts = {}) {
  const center = Number.isFinite(opts.center) ? Math.min(108, Math.max(24, opts.center)) : 60;
  /** @type {number[][]} */
  const out = [];
  for (const chord of Array.isArray(chords) ? chords : []) {
    const before = out[out.length - 1];
    let best = null;
    let least = Infinity;
    for (const notes of voicings(chord, center)) {
      const middle = notes.reduce((sum, note) => sum + note, 0) / notes.length;
      // Staying near the centre matters a little; staying near the last chord a lot.
      const cost =
        Math.abs(middle - center) * (before ? 0.1 : 1) + (before ? distance(before, notes) : 0);
      if (cost < least - 1e-9) [best, least] = [notes, cost];
    }
    if (best) out.push(best);
  }
  return out;
}
