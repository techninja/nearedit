/**
 * What a scoring style is, and how one is written down. A style is data:
 * a tempo range, a scale, chord progressions to choose from, a drum kit
 * with its layers and the instruments with the part each plays. The
 * generator (`generate.js`) turns one into a song.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Styles. Isomorphic and pure.
 * @module utils/director/score/style
 */

/**
 * The part an instrument plays: `bass` (the chords' roots), `chords`
 * (held or struck), `arp` (the chords one note at a time), `lead` (a melody).
 * @typedef {'bass'|'chords'|'arp'|'lead'} Role
 */

/**
 * One instrument of a style.
 * @typedef {Object} StylePart
 * @property {Role} role
 * @property {string} name - What the part is called in the song
 * @property {string} preset - A name in the engine's `PRESETS`
 * @property {number} from - Energy of a section at which it joins, 0 … 1
 * @property {number} volume
 * @property {number} pan
 * @property {number} reverb
 * @property {number} delay
 * @property {Record<string, any>} write - How its notes are written: the
 *   options of the theory helper its role uses (`bassLine`, `padNotes`,
 *   `arpeggio`, `melody`), plus `hits` for struck chords and `repeat`
 * @property {Record<string, any>} params - Synth parameters on top of the preset
 */

/**
 * One layer of the drums: a bar of lanes that joins at an energy.
 * @typedef {Object} DrumLayer
 * @property {string} name
 * @property {number} from
 * @property {number} volume
 * @property {number} reverb
 * @property {Record<string, string>} lanes - One bar, `steps` characters each
 */

/**
 * @typedef {Object} Style
 * @property {string} id
 * @property {string} label
 * @property {string} description - One line: what it sounds like and suits
 * @property {[number, number]} bpm - Tempos it sits well at
 * @property {number} beatsPerBar
 * @property {number} steps - Steps of a bar of its drum lanes
 * @property {string} scale - A name in the engine's `SCALES`
 * @property {string[]} keys - Keys its bass and chords sit well in
 * @property {string[]} progressions - One chord per bar, as Roman numerals
 * @property {string} turn - The chord of the bar that leads into a section
 * @property {number} swing
 * @property {string} kit - A name in the engine's `KITS`
 * @property {DrumLayer[]} drums - Quietest first; empty for a style without drums
 * @property {Record<string, string>} fill - The bar before a section with drums
 * @property {Record<string, string>} hit - The downbeat a fill lands on
 * @property {StylePart[]} parts
 * @property {{ volume: number, reverb: { size: number, decay: number },
 *   delay: { beats: number, feedback: number } }} master
 */

/**
 * @param {Role} role
 * @param {string} name
 * @param {string} preset
 * @param {number} from - Energy at which the part joins
 * @param {number[]} mix - `[volume, pan, reverb, delay]`
 * @param {Record<string, any>} [write]
 * @param {Record<string, any>} [params]
 * @returns {StylePart}
 */
export function part(role, name, preset, from, mix, write = {}, params = {}) {
  const [volume, pan = 0, reverb = 0, delay = 0] = mix;
  return Object.freeze({ role, name, preset, from, volume, pan, reverb, delay, write, params });
}

/**
 * @param {string} name
 * @param {number} from - Energy at which the layer joins
 * @param {number} volume
 * @param {Record<string, string>} lanes
 * @param {number} [reverb]
 * @returns {DrumLayer}
 */
export function layer(name, from, volume, lanes, reverb = 0) {
  return Object.freeze({ name, from, volume, reverb, lanes });
}

/**
 * The mix bus of a style.
 * @param {number} volume
 * @param {number[]} reverb - `[size, decay]`
 * @param {number[]} delay - `[beats, feedback]`
 * @returns {Style['master']}
 */
export function master(volume, reverb, delay) {
  return {
    volume,
    reverb: { size: reverb[0], decay: reverb[1] },
    delay: { beats: delay[0], feedback: delay[1] },
  };
}

/**
 * @param {Partial<Style> & { id: string, label: string, description: string }} fields
 * @returns {Style} With what most styles share filled in: four beats, sixteen steps
 */
export function style(fields) {
  return Object.freeze({
    beatsPerBar: 4,
    steps: 16,
    swing: 0,
    kit: '808',
    drums: [],
    fill: {},
    hit: {},
    turn: 'V',
    ...fields,
  });
}
