/**
 * A drum set in a room, as far as tones and noise can draw one: a short
 * kick with a beater, a snare that is mostly wires, hats of pure hiss.
 * @module utils/music/catalog/kits/acoustic
 */

import { drum, kit, metal, noise, tone } from './build.js';

const BRONZE = [317, 513, 728, 1183, 1629, 2137];

export default kit('acoustic', 'Acoustic', 'A played drum set: short kick, wiry snare, airy cymbals', {
  kick: drum(0, 1, {
    tones: [tone(62, 0.32, 1, { sweep: 1.8, sweepTime: 0.05 })],
    noise: noise('lowpass', 2500, 0.02, 0.5),
    lowpass: 6000,
  }),
  snare: drum(0, 0.8, {
    tones: [tone(205, 0.14, 0.45, { sweep: 0.25, sweepTime: 0.03 }), tone(348, 0.09, 0.2)],
    noise: noise('bandpass', 3200, 0.26, 0.9, { q: 0.5 }),
  }),
  clap: drum(0.05, 0.75, {
    noise: noise('bandpass', 1900, 0.22, 1, { q: 0.9, bursts: 4, gap: 0.013 }),
  }),
  rim: drum(-0.15, 0.7, {
    tones: [tone(780, 0.03, 0.5), tone(1750, 0.02, 0.4, { wave: 'triangle' })],
    noise: noise('bandpass', 2500, 0.015, 0.4, { q: 2 }),
  }),
  hat: drum(0.2, 0.55, {
    noise: noise('highpass', 6500, 0.055, 1, { q: 0.6 }),
    metal: metal(BRONZE, 'highpass', 7000, 0.05, 0.25),
  }),
  openHat: drum(0.2, 0.5, {
    noise: noise('highpass', 6000, 0.45, 1, { q: 0.6 }),
    metal: metal(BRONZE, 'highpass', 6500, 0.4, 0.25),
  }),
  tomLow: drum(-0.4, 0.85, {
    tones: [tone(98, 0.5, 1, { sweep: 0.9, sweepTime: 0.15 }), tone(147, 0.15, 0.15)],
    noise: noise('lowpass', 1800, 0.05, 0.25),
  }),
  tomMid: drum(0, 0.85, {
    tones: [tone(135, 0.42, 1, { sweep: 0.9, sweepTime: 0.14 }), tone(202, 0.13, 0.15)],
    noise: noise('lowpass', 2200, 0.05, 0.25),
  }),
  tomHigh: drum(0.4, 0.85, {
    tones: [tone(180, 0.36, 1, { sweep: 0.9, sweepTime: 0.13 }), tone(270, 0.11, 0.15)],
    noise: noise('lowpass', 2600, 0.05, 0.25),
  }),
  crash: drum(-0.3, 0.5, {
    noise: noise('highpass', 4500, 2.4, 0.8),
    metal: metal(BRONZE, 'highpass', 3800, 2, 0.5),
  }),
  ride: drum(0.35, 0.45, {
    metal: metal(BRONZE, 'bandpass', 6000, 1.8, 1, 0.8),
    noise: noise('highpass', 9000, 0.2, 0.4),
  }),
  cowbell: drum(0.25, 0.6, {
    metal: metal([562, 835], 'bandpass', 1400, 0.25, 1, 2.5),
    lowpass: 5000,
  }),
  shaker: drum(-0.25, 0.5, {
    noise: noise('bandpass', 7000, 0.1, 1, { q: 0.9, attack: 0.015 }),
  }),
});
