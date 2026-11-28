import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, drumPart, normalizeSong, validateSong } from './index.js';

/** The problems of a song as `path: message` lines. */
const problems = (song) => validateSong(song).problems.map((p) => `${p.path}: ${p.message}`);
/** The paths that have a problem. */
const paths = (song) => validateSong(song).problems.map((p) => p.path);

describe('validateSong', () => {
  it('finds nothing wrong with a song as it should be written', () => {
    assert.deepEqual(validateSong({}), { valid: true, problems: [] });
    const song = {
      bpm: 124,
      beatsPerBar: 4,
      bars: 8,
      swing: 0.2,
      key: 'Bb',
      scale: 'dorian',
      tail: 3,
      master: {
        volume: 0.9,
        reverb: { size: 0.3, decay: 0.7 },
        delay: { beats: 0.5, feedback: 0.4 },
      },
      parts: [
        {
          id: 'd',
          kind: 'drums',
          kit: '909',
          steps: 16,
          bars: 1,
          lanes: { kick: 'X...|x...|X...|x...', hat: 'x.x.' },
        },
        {
          id: 'b',
          kind: 'synth',
          preset: 'bass',
          bars: 2,
          transpose: -12,
          play: [
            [0, 4],
            [6, 8],
          ],
          params: { cutoff: 300, filterType: 'lowpass24', voices: 1 },
          notes: [
            [0, 0.5, 33, 0.9],
            [7.5, 0.5, 'C2'],
          ],
        },
        drumPart('trap', { bars: 4, fillEvery: 4 }),
      ],
    };
    assert.deepEqual(problems(song), []);
    assert.deepEqual(problems(normalizeSong(song)), [], 'and nothing with a normalised one');
    for (const name of Object.keys(BEATS))
      assert.deepEqual(problems({ parts: [drumPart(name)] }), []);
  });

  it('says what a song is when it is given something else', () => {
    for (const junk of [null, [], 'song', 5, undefined]) {
      assert.deepEqual(problems(junk), [
        ': a song is an object like { "bpm": 120, "bars": 4, "parts": [] }',
      ]);
    }
  });

  it('names the field and the range for a number that does not fit', () => {
    assert.deepEqual(problems({ bpm: 300, swing: 1, tail: -1, beatsPerBar: 2.5, bars: 0 }), [
      'bpm: 300 must be a number 40..240',
      'swing: 1 must be a number 0..0.75',
      'tail: -1 must be a number 0..30',
      'beatsPerBar: 2.5 must be a whole number 2..12',
      'bars: 0 must be a whole number 1..512',
    ]);
    assert.deepEqual(problems({ bpm: 'fast' }), ['bpm: "fast" must be a number 40..240']);
    assert.deepEqual(
      paths({
        master: { volume: 2, reverb: { size: 2, decay: -1 }, delay: { beats: 0, feedback: 1 } },
      }),
      [
        'master.volume',
        'master.reverb.size',
        'master.reverb.decay',
        'master.delay.beats',
        'master.delay.feedback',
      ],
    );
    assert.deepEqual(problems({ master: 'loud', parts: {} }), [
      'master: must be an object',
      'parts: must be a list of parts',
    ]);
  });

  it('says when a song is too long for its tempo', () => {
    assert.deepEqual(problems({ bpm: 60, bars: 400 }), [
      'bars: 400 bars at this tempo last more than 20 minutes; 299 fit',
    ]);
    assert.deepEqual(problems({ bpm: 120, bars: 512 }), []);
  });

  it('offers the names that exist for a key, a scale, a kit, a preset, a drum', () => {
    const found = problems({
      key: 'H',
      scale: 'happy',
      parts: [
        { kind: 'drums', kit: '707', steps: 10, lanes: { kik: 'x', snare: 'xyz', hat: 7 } },
        { kind: 'synth', preset: 'piano' },
        { kind: 'choir' },
        {},
        'drums',
      ],
    });
    assert.deepEqual(found, [
      'key: "H" is not a key: use a note name like C, C#, Db, D, D#',
      'scale: "happy" is not a scale: use one of major, minor, dorian, phrygian, lydian, mixolydian, locrian, harmonicMinor, melodicMinor, majorPentatonic, minorPentatonic, blues, chromatic',
      'parts[0].kit: "707" is not a kit: use one of 808, 909, acoustic, lofi',
      'parts[0].steps: 10 steps per bar: use one of 8, 12, 16, 24, 32',
      'parts[0].lanes.kik: is not a drum of a kit: use one of kick, snare, clap, rim, hat, openHat, tomLow, tomMid, tomHigh, crash, ride, cowbell, shaker',
      'parts[0].lanes.snare: "xyz" has characters other than . (rest) o (soft) x (hit) X (accent)',
      'parts[0].lanes.hat: must be a string with one character per step: . o x or X',
      'parts[1].preset: "piano" is not a preset: use one of bass, sub, acid, pluck, keys, organ, pad, strings, lead, bell, arp',
      'parts[2].kind: "choir" is not a kind of part: use "drums" or "synth"',
      'parts[3].kind: is required: use "drums" or "synth"',
      'parts[4]: must be an object like { "kind": "drums", "lanes": {} }',
    ]);
  });

  it('checks the mix, the loop and the ranges of a part', () => {
    const part = {
      kind: 'drums',
      id: 'a',
      volume: 2,
      pan: -2,
      reverb: 2,
      delay: -1,
      bars: 0.5,
      play: [[0, 4], [4, 2], 'x', [1.5, 3]],
    };
    assert.deepEqual(
      paths({ parts: [part, { kind: 'synth', id: 'a', transpose: 100, play: 'always' }] }),
      [
        ...['volume', 'pan', 'reverb', 'delay', 'bars', 'play[1]', 'play[2]', 'play[3]'].map(
          (name) => `parts[0].${name}`,
        ),
        ...['id', 'transpose', 'play'].map((name) => `parts[1].${name}`),
      ],
    );
    assert.deepEqual(problems({ parts: [{ kind: 'drums', play: [[4, 2]] }] }), [
      'parts[0].play[0]: [4, 2] is not a bar range: [from, to] in whole bars, from < to',
    ]);
  });

  it('points at the lane that is longer than its loop, the note that cannot be played', () => {
    const found = problems({
      parts: [
        { kind: 'drums', bars: 1, lanes: { kick: 'x'.repeat(20), snare: 'x' } },
        {
          kind: 'synth',
          bars: 1,
          params: { cutoff: 99999, osc1Wave: 'square', wobble: 1 },
          notes: [
            [0, 1, 60, 1],
            [4, 1, 60],
            [0, 1, 'H9'],
            [0, -1, 60],
            [0, 1, 60, 3],
            [-1, 1, 60],
            'c',
            [1, 1, 128],
            { beat: 0, pitch: 60 },
          ],
        },
        { kind: 'synth', params: [], notes: 'c d e' },
      ],
    });
    assert.deepEqual(found, [
      "parts[0].lanes.kick: has 20 steps; the part's loop has 16, the rest is cut",
      'parts[1].params.cutoff: 99999 must be a number 20..20000',
      'parts[1].params.osc1Wave: "square" is not one of sine, triangle, saw, pulse, noise',
      'parts[1].params.wobble: is not a parameter of the synth (see SYNTH_PARAMS)',
      "parts[1].notes[1]: starts at beat 4, after the end of the part's loop of 4 beats",
      'parts[1].notes[2]: "H9" is not a pitch: a MIDI note number 0..127 (60 = middle C) or a name like "C4"',
      'parts[1].notes[3]: -1 is not a length: beats, more than 0',
      'parts[1].notes[4]: 3 is not a velocity: more than 0, at most 1',
      'parts[1].notes[5]: -1 is not a beat: a number, 0 or more',
      'parts[1].notes[6]: must be [beat, length, pitch, velocity], like [0, 0.5, 60, 0.8]',
      'parts[1].notes[7]: 128 is not a pitch: a MIDI note number 0..127 (60 = middle C) or a name like "C4"',
      'parts[2].params: must be an object',
      'parts[2].notes: must be a list of [beat, length, pitch, velocity]',
    ]);
  });

  it('counts what is too much, and stops talking after 200 problems', () => {
    const notes = Array.from({ length: 4500 }, () => [0, 1, 999]);
    const lanes = { kick: 'x' };
    const found = validateSong({
      parts: [
        ...Array.from({ length: 17 }, () => ({ kind: 'drums', lanes })),
        { kind: 'synth', notes },
      ],
    });
    assert.equal(found.problems[0].message, 'has 18 parts; a song plays at most 16');
    const crowded = validateSong({ parts: [{ kind: 'synth', notes }] });
    assert.equal(crowded.problems[0].message, 'has 4500 notes; a part plays at most 4000');
    assert.equal(crowded.problems.length, 200);
    assert.equal(crowded.valid, false);
  });
});
