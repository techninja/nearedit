/**
 * The particle layer of a motion piece: a preset of the catalog per scene,
 * scaled to the output size. Neighbouring scenes that share a preset share
 * one clip, so the field carries on through the transition between them;
 * a preset that is a single burst goes off anew with every title.
 * @module api/director/motion/particles
 */

import { GENERATORS } from '#utils/compose/index.js';
import { hash } from '#utils/compose/random.js';
import { particlePreset } from '#utils/director/motion/vocab.js';
import { clipAt } from './clips.js';

/** Presets are tuned for a frame whose shorter side is this long. */
const REFERENCE = 1080;

/**
 * A preset's parameters with every length scaled to the output size. Which
 * parameters are lengths is read from the generator's schema (unit `px…`).
 * @param {Record<string, any>} params
 * @param {{ width: number, height: number }} frame
 * @returns {Record<string, any>}
 */
export function scaledParams(params, frame) {
  const factor = Math.min(frame.width, frame.height) / REFERENCE;
  if (Math.abs(factor - 1) < 0.05) return { ...params };
  const schema = GENERATORS.find((g) => g.type === 'particles')?.params || {};
  const out = { ...params };
  for (const [name, spec] of Object.entries(schema)) {
    if (spec.type !== 'number' || !String(spec.unit || '').startsWith('px')) continue;
    const value = Number(params[name] ?? spec.default);
    if (value) out[name] = Math.round(value * factor * 100) / 100;
  }
  return out;
}

/**
 * @typedef {{ index: number, startF: number, endF: number, textF: number,
 *   particles: string }} ParticleShot
 */

/**
 * The particle clips of a piece.
 * @param {ParticleShot[]} shots - In order; `textF` is the frame the title enters on
 * @param {{ fps: number, seed: number, frame: { width: number, height: number } }} opts
 * @returns {any[]} Clips, in time order, never overlapping
 */
export function particleClips(shots, { fps, seed, frame }) {
  const clips = [];
  for (let i = 0; i < shots.length; i++) {
    const preset = particlePreset(shots[i].particles);
    if (!preset) continue;
    // A single burst: the steady flow is switched off and the burst does not repeat.
    const burst = preset.params.rate === 0 && !(preset.params.burstEvery > 0);
    let last = i;
    while (!burst && shots[last + 1]?.particles === shots[i].particles) last++;
    const startF = burst ? shots[i].textF : shots[i].startF;
    const lengthF = shots[last].endF - startF;
    const fade = (/** @type {number} */ seconds) => Math.min(seconds, lengthF / fps / 4);
    clips.push(
      clipAt(startF, shots[last].endF, fps, {
        generator: {
          type: 'particles',
          seed: hash(seed, shots[i].index, 3),
          params: scaledParams(preset.params, frame),
        },
        blendMode: preset.blendMode || 'normal',
        fadeIn: burst ? 0 : fade(0.8),
        fadeOut: fade(0.6),
        label: `Particles · ${preset.name || preset.id}`,
      }),
    );
    i = last;
  }
  return clips;
}
