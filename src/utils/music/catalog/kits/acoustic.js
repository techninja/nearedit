/**
 * A drum set in a room, as far as tones and noise can draw one: a short
 * kick with a beater, a snare that is mostly wires, hats of pure hiss.
 * @module utils/music/catalog/kits/acoustic
 */

import { drum, kit, metal, noise, tone } from './build.js';

const BRONZE = [317, 513, 728, 1183, 1629, 2137];

export default kit(
  'acoustic',
  'Acoustic',
  'A played drum set: short kick, wiry snare, airy cymbals',
  {
    kick: drum(0, 0.79, {
      tones: [tone(62, 0.32, 1, { sweep: 1.8, sweepTime: 0.05 })],
      noise: noise('lowpass', 2500, 0.02, 0.5),
      lowpass: 6000,
    }),
    snare: drum(0, 0.46, {
      tones: [tone(190, 0.2, 0.6, { sweep: 0.25, sweepTime: 0.03 }), tone(292, 0.13, 0.3)],
      noise: noise('bandpass', 2400, 0.24, 0.8, { q: 0.5 }),
    }),
    clap: drum(0.05, 0.97, {
      noise: noise('bandpass', 1900, 0.22, 1, { q: 0.9, bursts: 4, gap: 0.013 }),
    }),
    rim: drum(-0.15, 0.56, {
      tones: [tone(780, 0.03, 0.5), tone(1750, 0.02, 0.4, { wave: 'triangle' })],
      noise: noise('bandpass', 2500, 0.015, 0.4, { q: 2 }),
    }),
    hat: drum(0.2, 0.33, {
      noise: noise('highpass', 4500, 0.07, 1, { q: 0.6 }),
      metal: metal(BRONZE, 'highpass', 5000, 0.06, 0.6),
      lowpass: 12000,
    }),
    openHat: drum(0.2, 0.25, {
      noise: noise('highpass', 4200, 0.9, 1, { q: 0.6 }),
      metal: metal(BRONZE, 'highpass', 4800, 0.8, 0.6),
      lowpass: 12000,
    }),
    tomLow: drum(-0.4, 0.48, {
      tones: [tone(98, 1, 1, { sweep: 0.4, sweepTime: 0.2 }), tone(152, 0.3, 0.2)],
      noise: noise('lowpass', 1800, 0.05, 0.25),
    }),
    tomMid: drum(0, 0.45, {
      tones: [tone(135, 0.85, 1, { sweep: 0.4, sweepTime: 0.18 }), tone(209, 0.26, 0.2)],
      noise: noise('lowpass', 2200, 0.05, 0.25),
    }),
    tomHigh: drum(0.4, 0.49, {
      tones: [tone(180, 0.7, 1, { sweep: 0.4, sweepTime: 0.16 }), tone(279, 0.22, 0.2)],
      noise: noise('lowpass', 2600, 0.05, 0.25),
    }),
    crash: drum(-0.3, 0.28, {
      noise: noise('highpass', 3200, 3.2, 0.8),
      metal: metal(BRONZE, 'highpass', 2800, 2.8, 0.7),
      lowpass: 13000,
    }),
    ride: drum(0.35, 0.22, {
      metal: metal(BRONZE, 'bandpass', 4200, 2.6, 1, 1.4),
      noise: noise('highpass', 7000, 0.15, 0.4),
    }),
    cowbell: drum(0.25, 0.55, {
      metal: metal([562, 835], 'bandpass', 1400, 0.25, 1, 2.5),
      lowpass: 5000,
    }),
    shaker: drum(-0.25, 0.63, {
      noise: noise('bandpass', 7000, 0.1, 1, { q: 0.9, attack: 0.015 }),
    }),
  },
);
