/**
 * Effect presets — ready-made looks as data: a name, a description and an
 * ordered list of effects with the parameters that differ from their
 * defaults. An editor lists them and adds the effects to a clip or a track
 * in order (through `addEffect`, which gives each its id); the director is
 * told they exist by name. Nothing here draws: every look is made of the
 * effects in this folder and can be taken apart again in the effect stack.
 * Order matters — see docs/app-spec/EFFECTS.md § Order.
 * Isomorphic and pure.
 * @module utils/compose/effects/presets
 */

/**
 * @typedef {Object} EffectPreset
 * @property {string} name - Stable id
 * @property {string} label
 * @property {string} description
 * @property {{ type: string, params: Record<string, any> }[]} effects - In stack order
 */

/** @type {EffectPreset[]} */
export const EFFECT_PRESETS = [
  {
    name: 'cinematic',
    label: 'Cinematic',
    description: 'More contrast, a little less colour, dark corners and fine grain',
    effects: [
      { type: 'colorAdjust', params: { contrast: 1.15, saturation: 0.85 } },
      { type: 'vignette', params: { amount: 0.5, size: 0.75, softness: 0.7 } },
      { type: 'grain', params: { amount: 0.18 } },
    ],
  },
  {
    name: 'dream',
    label: 'Dream',
    description: 'Soft focus with blooming highlights and lifted blacks',
    effects: [
      { type: 'blur', params: { radius: 2 } },
      { type: 'glow', params: { radius: 36, intensity: 0.45, threshold: 0.5 } },
      { type: 'levels', params: { midtones: 0.2, outBlack: 0.06 } },
    ],
  },
  {
    name: 'vhs',
    label: 'VHS',
    description: 'Colour fringes, scanlines, coloured noise and a restless picture',
    effects: [
      { type: 'colorAdjust', params: { contrast: 0.92, saturation: 1.25 } },
      { type: 'rgbSplit', params: { distance: 6 } },
      { type: 'scanlines', params: { opacity: 0.25 } },
      { type: 'grain', params: { amount: 0.3, size: 2.5, colored: true } },
      { type: 'flicker', params: { amount: 0.06, rate: 0 } },
    ],
  },
  {
    name: 'noir',
    label: 'Noir',
    description: 'Hard black and white with heavy corners and grain',
    effects: [
      { type: 'stylize', params: { grayscale: 1 } },
      { type: 'colorAdjust', params: { contrast: 1.35 } },
      { type: 'vignette', params: { amount: 0.7, size: 0.65, softness: 0.7 } },
      { type: 'grain', params: { amount: 0.22, size: 2 } },
    ],
  },
  {
    name: 'warm',
    label: 'Warm',
    description: 'Golden-hour white balance with slightly richer colour',
    effects: [
      { type: 'colorBalance', params: { temperature: 0.4 } },
      { type: 'colorAdjust', params: { saturation: 1.1 } },
    ],
  },
  {
    name: 'cool',
    label: 'Cool',
    description: 'A cold, blue-leaning white balance',
    effects: [
      { type: 'colorBalance', params: { temperature: -0.4 } },
      { type: 'colorAdjust', params: { saturation: 0.95 } },
    ],
  },
  {
    name: 'spotlight',
    label: 'Spotlight',
    description: 'A pool of light in the middle, the rest falling into darkness',
    effects: [
      { type: 'vignette', params: { amount: 0.9, size: 0.42, softness: 0.4, roundness: 1 } },
    ],
  },
  {
    name: 'vintage',
    label: 'Vintage',
    description: 'A faded sepia print: brown tones, soft blacks, dark corners, grain',
    effects: [
      { type: 'stylize', params: { sepia: 0.75 } },
      { type: 'levels', params: { outBlack: 0.08, outWhite: 0.95 } },
      { type: 'vignette', params: { amount: 0.45, softness: 0.8 } },
      { type: 'grain', params: { amount: 0.22, size: 2 } },
    ],
  },
  {
    name: 'neon',
    label: 'Neon',
    description: 'A tight bright glow inside a wide soft one — for titles and shapes',
    effects: [
      { type: 'glow', params: { radius: 6, intensity: 1 } },
      { type: 'glow', params: { radius: 40, intensity: 0.7 } },
    ],
  },
  {
    name: 'glitch',
    label: 'Glitch',
    description: 'A wide colour split, coarse levels and rolling lines',
    effects: [
      { type: 'rgbSplit', params: { distance: 18, angle: 12 } },
      { type: 'posterize', params: { levels: 6 } },
      { type: 'scanlines', params: { spacing: 12, thickness: 0.3, opacity: 0.4, speed: 240 } },
    ],
  },
];

/**
 * @param {unknown} name
 * @returns {EffectPreset|undefined}
 */
export const effectPreset = (name) => EFFECT_PRESETS.find((preset) => preset.name === name);
