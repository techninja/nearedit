/**
 * Particle presets — named parameter sets to start from. Each is plain
 * data: `params` holds only what differs from the schema defaults, so
 * `insertGenerator(edl, { type: 'particles', params: preset.params })` is a
 * finished layer. Sizes and speeds are tuned for a 1920 × 1080 frame;
 * emitters are sized in fractions of the frame and fit any aspect ratio.
 * Reference: docs/app-spec/PARTICLES.md § Presets.
 * @module utils/compose/generators/particles/presets
 */

import { LIGHT_PRESETS } from './presetsLight.js';
import { OBJECT_PRESETS } from './presetsObjects.js';
import { WEATHER_PRESETS } from './presetsWeather.js';

/**
 * @typedef {Object} ParticlePreset
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {Record<string, any>} params - Generator parameters
 * @property {string} [blendMode] - The clip blend mode that suits the
 *   layer when it lies over other pictures (`add` for light)
 */

/** Every preset, in the order menus list them. */
export const PRESETS = [...WEATHER_PRESETS, ...LIGHT_PRESETS, ...OBJECT_PRESETS];
