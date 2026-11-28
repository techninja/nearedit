/**
 * Presets: named corners of the one synth design. A preset is only a set of
 * parameter values (what differs from `SYNTH_PARAMS`' defaults); a part
 * names a preset and may override any parameter on top. `level` is trimmed
 * so that every preset plays about equally loud. Isomorphic and pure.
 * @module utils/music/catalog/presets
 */

/**
 * @typedef {Object} Preset
 * @property {string} name - What a part's `preset` holds
 * @property {string} label
 * @property {string} description
 * @property {'bass'|'keys'|'pad'|'lead'} category
 * @property {Record<string, any>} params - What differs from the defaults
 */

/** Categories, in the order a menu shows them. */
export const PRESET_CATEGORIES = Object.freeze(['bass', 'keys', 'pad', 'lead']);

/**
 * @param {string} name
 * @param {string} label
 * @param {Preset['category']} category
 * @param {string} description
 * @param {Record<string, any>} params
 * @returns {Preset}
 */
function preset(name, label, category, description, params) {
  return Object.freeze({ name, label, description, category, params: Object.freeze(params) });
}

const list = [
  preset('bass', 'Bass', 'bass', 'A round, punchy synth bass: saw and pulse through a closing filter', {
    ...{ osc2Wave: 'pulse', osc2Level: 0.5, osc2Width: 0.4, osc2Detune: 7, subLevel: 0.5 },
    ...{ filterType: 'lowpass24', cutoff: 180, resonance: 0.2, keyTrack: 0.5, filterEnv: 3.4 },
    ...{ filterAttack: 0.002, filterDecay: 0.22, filterSustain: 0.2, filterRelease: 0.15 },
    ...{ attack: 0.003, decay: 0.3, sustain: 0.8, release: 0.09, velocity: 0.5, drive: 0.25 },
    ...{ voices: 1, level: 0 },
  }),
  preset('sub', 'Sub bass', 'bass', 'A deep sine with a little warmth, felt more than heard', {
    ...{ osc1Wave: 'sine', osc1Level: 1, osc2Wave: 'triangle', osc2Level: 0.15, osc2Pitch: 12 },
    ...{ cutoff: 900, resonance: 0, keyTrack: 0, attack: 0.008, decay: 0.2, sustain: 0.9 },
    ...{ release: 0.12, velocity: 0.3, drive: 0.2, voices: 1, level: 0 },
  }),
  preset('acid', 'Acid', 'bass', 'A squelching, sliding saw line: high resonance, fast filter envelope', {
    ...{ osc1Level: 0.9, filterType: 'lowpass24', cutoff: 260, resonance: 0.8, keyTrack: 0.3 },
    ...{ filterEnv: 4.2, filterAttack: 0.002, filterDecay: 0.24, filterSustain: 0.05 },
    ...{ filterRelease: 0.1, attack: 0.002, decay: 0.3, sustain: 0.65, release: 0.06 },
    ...{ velocity: 0.8, drive: 0.5, voices: 1, glide: 0.07, level: 0 },
  }),
  preset('pluck', 'Pluck', 'keys', 'A short, bright pluck that dies away by itself', {
    ...{ osc2Wave: 'pulse', osc2Level: 0.6, osc2Width: 0.35, osc2Detune: 9, unison: 2 },
    ...{ detune: 8, spread: 0.6, cutoff: 500, resonance: 0.25, keyTrack: 0.6, filterEnv: 4.5 },
    ...{ filterAttack: 0.001, filterDecay: 0.18, filterSustain: 0, filterRelease: 0.2 },
    ...{ attack: 0.002, decay: 0.45, sustain: 0, release: 0.3, level: 0 },
  }),
  preset('keys', 'Keys', 'keys', 'An electric piano: a soft sine with a bell-like bite on harder notes', {
    ...{ osc1Wave: 'sine', osc1Level: 0.9, osc2Wave: 'sine', osc2Level: 0.05, osc2Pitch: 12 },
    ...{ fm: 0.3, unison: 2, detune: 4, spread: 0.35, cutoff: 5000, resonance: 0, keyTrack: 0.2 },
    ...{ filterAttack: 0.001, filterDecay: 0.9, filterSustain: 0.12, filterRelease: 0.3 },
    ...{ attack: 0.002, decay: 1.6, sustain: 0.25, release: 0.35, velocity: 0.8 },
    ...{ lfoRate: 4.5, lfoAmp: 0.08, level: 0 },
  }),
  preset('organ', 'Organ', 'keys', 'Three sine drawbars with a slow shimmer; holds as long as the note', {
    ...{ osc1Wave: 'sine', osc1Level: 0.8, osc2Wave: 'sine', osc2Level: 0.5, osc2Pitch: 19 },
    ...{ subLevel: 0.7, cutoff: 6000, resonance: 0, keyTrack: 0, attack: 0.004, decay: 0.05 },
    ...{ sustain: 1, release: 0.06, velocity: 0.15, drive: 0.2, lfoRate: 6.2, lfoPitch: 0.06 },
    ...{ lfoAmp: 0.12, level: 0 },
  }),
  preset('pad', 'Pad', 'pad', 'A wide, slow wash of detuned saws for chords', {
    ...{ osc2Level: 0.7, osc2Detune: -9, unison: 3, detune: 16, spread: 0.9, cutoff: 700 },
    ...{ resonance: 0.12, keyTrack: 0.4, filterEnv: 1.6, filterAttack: 0.9, filterDecay: 1.5 },
    ...{ filterSustain: 0.6, filterRelease: 1.4, attack: 0.5, decay: 1, sustain: 0.85 },
    ...{ release: 1.5, velocity: 0.3, lfoRate: 0.23, lfoFilter: 0.35, level: 0 },
  }),
  preset('strings', 'Strings', 'pad', 'A string-machine ensemble: saw and a moving pulse, gentle vibrato', {
    ...{ osc2Wave: 'pulse', osc2Level: 0.6, osc2Width: 0.5, osc2Pitch: 12, unison: 3, detune: 11 },
    ...{ spread: 0.8, cutoff: 2600, resonance: 0.05, keyTrack: 0.3, filterEnv: 0.6 },
    ...{ filterAttack: 0.3, filterDecay: 0.8, filterSustain: 0.7, filterRelease: 0.6 },
    ...{ attack: 0.22, decay: 0.5, sustain: 0.9, release: 0.6, velocity: 0.4, lfoRate: 5.3 },
    ...{ lfoFade: 0.5, lfoPitch: 0.09, lfoWidth: 0.25, level: 0 },
  }),
  preset('lead', 'Lead', 'lead', 'A singing mono lead that glides between notes, vibrato on long ones', {
    ...{ osc2Wave: 'pulse', osc2Level: 0.55, osc2Width: 0.3, osc2Detune: 8, unison: 2, detune: 9 },
    ...{ spread: 0.4, filterType: 'lowpass24', cutoff: 1500, resonance: 0.3, keyTrack: 0.6 },
    ...{ filterEnv: 1.8, filterAttack: 0.004, filterDecay: 0.4, filterSustain: 0.5 },
    ...{ attack: 0.006, decay: 0.3, sustain: 0.8, release: 0.18, drive: 0.3, lfoRate: 5.6 },
    ...{ lfoFade: 0.35, lfoPitch: 0.18, voices: 1, glide: 0.05, level: 0 },
  }),
  preset('bell', 'Bell', 'keys', 'A glassy FM bell with a long ring', {
    ...{ osc1Wave: 'sine', osc1Level: 0.9, osc2Wave: 'sine', osc2Level: 0.12, osc2Pitch: 21.69 },
    ...{ fm: 0.42, unison: 2, detune: 5, spread: 0.6, cutoff: 9000, resonance: 0, keyTrack: 0.2 },
    ...{ filterAttack: 0.001, filterDecay: 1.8, filterSustain: 0.05, filterRelease: 1.2 },
    ...{ attack: 0.001, decay: 2.6, sustain: 0, release: 1.8, velocity: 0.7, level: 0 },
  }),
  preset('arp', 'Arp', 'lead', 'A tight, hollow blip made for fast arpeggios and sequences', {
    ...{ osc1Wave: 'pulse', osc1Width: 0.28, osc2Level: 0.45, osc2Pitch: 12, osc2Detune: 6 },
    ...{ cutoff: 900, resonance: 0.35, keyTrack: 0.5, filterEnv: 3.2, filterAttack: 0.001 },
    ...{ filterDecay: 0.12, filterSustain: 0.1, filterRelease: 0.1, attack: 0.002, decay: 0.16 },
    ...{ sustain: 0.2, release: 0.12, velocity: 0.5, level: 0 },
  }),
];

/**
 * Every preset by name.
 * @type {Readonly<Record<string, Preset>>}
 */
export const PRESETS = Object.freeze(Object.fromEntries(list.map((entry) => [entry.name, entry])));

/** The preset of a part that names none, or one that does not exist. */
export const DEFAULT_PRESET = 'keys';
