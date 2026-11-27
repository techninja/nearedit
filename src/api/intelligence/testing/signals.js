/**
 * Deterministic audio test signals with known beat times — click tracks,
 * simple drum patterns, noise. Used by the DSP and step tests; never
 * imported by the server.
 * @module api/intelligence/testing/signals
 */

/**
 * Small seeded PRNG (mulberry32) so noise is identical on every run.
 * @param {number} seed
 * @returns {() => number} Uniform values in -1..1
 */
export function seededNoise(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * @typedef {Object} Hit
 * @property {'click'|'kick'|'snare'|'hat'} sound
 * @property {number} time - Seconds
 * @property {number} gain
 */

/**
 * Mix one percussive hit into a buffer.
 * @param {Float32Array} out
 * @param {number} sampleRate
 * @param {Hit} hit
 * @param {() => number} noise
 */
function addHit(out, sampleRate, hit, noise) {
  const start = Math.round(hit.time * sampleRate);
  const length = { click: 0.004, kick: 0.25, snare: 0.15, hat: 0.04 }[hit.sound] * sampleRate;
  let previous = 0;
  for (let i = 0; i < length && start + i < out.length; i++) {
    const t = i / sampleRate;
    let value = 0;
    if (hit.sound === 'click') value = Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-t * 900);
    if (hit.sound === 'kick') {
      const phase = 2 * Math.PI * (50 * t + (70 / 30) * (1 - Math.exp(-30 * t)));
      value = Math.sin(phase) * Math.exp(-t * 14);
    }
    if (hit.sound === 'snare') {
      value = (0.7 * noise() + 0.3 * Math.sin(2 * Math.PI * 190 * t)) * Math.exp(-t * 28);
    }
    if (hit.sound === 'hat') {
      const white = noise();
      value = (white - previous) * 0.5 * Math.exp(-t * 90); // crude high-pass
      previous = white;
    }
    out[start + i] += hit.gain * value;
  }
}

/**
 * Render a list of hits, optionally over a noise floor.
 * @param {Hit[]} hits
 * @param {{ seconds: number, sampleRate?: number, noiseLevel?: number, seed?: number }} options
 * @returns {Float32Array}
 */
export function render(hits, options) {
  const { seconds, sampleRate = 22050, noiseLevel = 0, seed = 1 } = options;
  const noise = seededNoise(seed);
  const out = new Float32Array(Math.round(seconds * sampleRate));
  if (noiseLevel > 0) for (let i = 0; i < out.length; i++) out[i] = noiseLevel * noise();
  for (const hit of hits) addHit(out, sampleRate, hit, noise);
  return out;
}

/**
 * Beat times of a steady tempo.
 * @param {number} bpm
 * @param {number} seconds
 * @param {number} [offset=0.2] - Time of the first beat
 * @returns {number[]}
 */
export function beatGrid(bpm, seconds, offset = 0.2) {
  const beats = [];
  for (let t = offset; t < seconds - 0.3; t += 60 / bpm) beats.push(t);
  return beats;
}

/**
 * A metronome: one identical click per beat.
 * @param {number} bpm
 * @param {number} seconds
 * @param {{ sampleRate?: number, offset?: number }} [options]
 * @returns {{ samples: Float32Array, beats: number[] }}
 */
export function clickTrack(bpm, seconds, options = {}) {
  const beats = beatGrid(bpm, seconds, options.offset);
  const hits = beats.map((time) => ({ sound: /** @type {const} */ ('click'), time, gain: 0.8 }));
  return { samples: render(hits, { seconds, sampleRate: options.sampleRate }), beats };
}

/**
 * A rock-style pattern: kick on odd beats, snare on even beats, quieter
 * hi-hats on every eighth note, over a low noise floor.
 * @param {number} bpm
 * @param {number} seconds
 * @param {{ sampleRate?: number, offset?: number, hatGain?: number, seed?: number }} [options]
 * @returns {{ samples: Float32Array, beats: number[] }}
 */
export function drumPattern(bpm, seconds, options = {}) {
  const beats = beatGrid(bpm, seconds, options.offset);
  /** @type {Hit[]} */
  const hits = [];
  beats.forEach((time, i) => {
    hits.push({ sound: i % 2 ? 'snare' : 'kick', time, gain: i % 2 ? 0.6 : 0.9 });
    hits.push({ sound: 'hat', time, gain: options.hatGain ?? 0.2 });
    hits.push({ sound: 'hat', time: time + 30 / bpm, gain: options.hatGain ?? 0.2 });
  });
  const samples = render(hits, {
    seconds,
    sampleRate: options.sampleRate,
    noiseLevel: 0.003,
    seed: options.seed,
  });
  return { samples, beats };
}
