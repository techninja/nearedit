/**
 * Shared JSDoc types of music clips. No runtime code.
 * Field semantics: docs/app-spec/MUSIC.md.
 * @module utils/music/types
 */

/**
 * One note of a synth part: `[beat, length, pitch, velocity]` — beats from
 * the start of the part's loop, length in beats, a MIDI note number
 * (60 = middle C), velocity 0 … 1.
 * @typedef {number[]} Note
 */

/**
 * What every part has, whatever its kind.
 * @typedef {Object} PartFields
 * @property {string} id - Unique within the song
 * @property {string} name - '' = named after its kit or preset
 * @property {'drums'|'synth'} kind
 * @property {boolean} mute
 * @property {number} volume - 0 … 1.5
 * @property {number} pan - −1 (left) … 1 (right)
 * @property {number} reverb - Send to the song's reverb, 0 … 1
 * @property {number} delay - Send to the song's delay, 0 … 1
 * @property {number} bars - Length of the part's own loop
 * @property {number[][]} play - Bar ranges `[from, to)` where the part
 *   sounds; empty = everywhere. The loop starts again in every range
 */

/**
 * A drum pattern on a step grid.
 * @typedef {PartFields & { kind: 'drums', kit: string, steps: number,
 *   lanes: Record<string, string> }} DrumPart
 */

/**
 * A synth line.
 * @typedef {PartFields & { kind: 'synth', preset: string, params: Record<string, any>,
 *   transpose: number, notes: Note[] }} SynthPart
 */

/** @typedef {DrumPart | SynthPart} Part */

/**
 * @typedef {Object} Song
 * @property {number} bpm - 40 … 240
 * @property {number} beatsPerBar - 2 … 12
 * @property {number} bars - Length of the song, 1 … 512
 * @property {number} swing - 0 … 0.75 of a sixteenth
 * @property {string} key - A note name, for editors and the director
 * @property {string} scale - A name in `SCALES`
 * @property {number} tail - Seconds of ring-out after the last bar
 * @property {{ volume: number, reverb: { size: number, decay: number },
 *   delay: { beats: number, feedback: number } }} master
 * @property {Part[]} parts - At most 16
 */

/**
 * A song being rendered.
 * @typedef {Object} Renderer
 * @property {number} frames - Frames of the whole song
 * @property {number} sampleRate
 * @property {number} position - Frames rendered so far
 * @property {(count?: number) => Float32Array} render - The next `count`
 *   frames (all that are left by default) as interleaved stereo samples;
 *   empty once the song is over
 */

/**
 * The `music` field of a clip.
 * @typedef {{ song: Song, key: string }} MusicBlock
 */

/**
 * One thing wrong with a song, for the person who wrote it.
 * @typedef {{ path: string, message: string }} Problem
 */

export {};
