/**
 * The 808: a long, soft sine kick, a snare of two tones and hiss, and hats
 * and cymbals made of six square waves — the sound of electro and hip-hop.
 * @module utils/music/catalog/kits/tr808
 */

import { drum, kit, metal, noise, tone } from './build.js';

/** The six oscillators of the original's hats, cymbal and cowbell. */
const SQUARES = [205.3, 304.4, 369.6, 522.7, 540, 800];

export default kit('808', '808', 'Soft and boomy: a long sine kick, ticking metal hats', {
  kick: drum(0, 1, {
    tones: [tone(47, 1.1, 1, { sweep: 1.7, sweepTime: 0.09 })],
    noise: noise('lowpass', 2200, 0.012, 0.12),
    drive: 0.15,
  }),
  snare: drum(0, 0.8, {
    tones: [tone(176, 0.22, 0.6, { sweep: 0.3, sweepTime: 0.04 }), tone(330, 0.13, 0.32)],
    noise: noise('highpass', 1800, 0.28, 0.55),
  }),
  clap: drum(0.05, 0.8, {
    noise: noise('bandpass', 1150, 0.36, 1, { q: 1.6, bursts: 3, gap: 0.011 }),
  }),
  rim: drum(-0.15, 0.7, {
    tones: [tone(1667, 0.035, 0.6), tone(455, 0.05, 0.5)],
    noise: noise('highpass', 3000, 0.012, 0.2),
  }),
  hat: drum(0.2, 0.55, { metal: metal(SQUARES, 'highpass', 7000, 0.09, 1) }),
  openHat: drum(0.2, 0.5, { metal: metal(SQUARES, 'highpass', 6500, 0.8, 1) }),
  tomLow: drum(-0.4, 0.85, {
    tones: [tone(90, 0.6, 1, { sweep: 0.7, sweepTime: 0.12 })],
    noise: noise('lowpass', 600, 0.1, 0.08),
  }),
  tomMid: drum(0, 0.85, {
    tones: [tone(130, 0.5, 1, { sweep: 0.7, sweepTime: 0.11 })],
    noise: noise('lowpass', 800, 0.09, 0.08),
  }),
  tomHigh: drum(0.4, 0.85, {
    tones: [tone(185, 0.42, 1, { sweep: 0.7, sweepTime: 0.1 })],
    noise: noise('lowpass', 1000, 0.08, 0.08),
  }),
  crash: drum(-0.3, 0.5, {
    metal: metal(SQUARES, 'highpass', 4200, 2.2, 0.8),
    noise: noise('highpass', 6000, 1.4, 0.35),
  }),
  ride: drum(0.35, 0.45, {
    metal: metal(SQUARES, 'bandpass', 5200, 1.6, 1, 1.2),
    noise: noise('highpass', 8000, 0.3, 0.12),
  }),
  cowbell: drum(0.25, 0.6, { metal: metal([540, 800], 'bandpass', 1100, 0.45, 1, 1.5) }),
  shaker: drum(-0.25, 0.5, {
    noise: noise('bandpass', 6500, 0.11, 1, { q: 1.2, attack: 0.012 }),
  }),
});
