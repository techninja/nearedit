/**
 * The 909: a kick that punches and is gone, a bright snare, noisy hats —
 * house and techno.
 * @module utils/music/catalog/kits/tr909
 */

import { drum, kit, metal, noise, tone } from './build.js';

const SQUARES = [263, 400, 421, 474, 587, 845];

export default kit(
  '909',
  '909',
  'Hard and bright: a punching kick, a cracking snare, hissing hats',
  {
    kick: drum(0, 1.16, {
      tones: [tone(52, 0.5, 1, { sweep: 4.5, sweepTime: 0.07 })],
      noise: noise('lowpass', 5000, 0.012, 0.35),
      drive: 0.4,
    }),
    snare: drum(0, 0.83, {
      tones: [
        tone(195, 0.16, 0.5, { wave: 'triangle', sweep: 0.6, sweepTime: 0.05 }),
        tone(320, 0.1, 0.25, { wave: 'triangle' }),
      ],
      noise: noise('bandpass', 4500, 0.24, 0.8, { q: 0.6 }),
      drive: 0.2,
    }),
    clap: drum(0.05, 1.39, {
      noise: noise('bandpass', 1500, 0.42, 1, { q: 1.2, bursts: 3, gap: 0.009 }),
    }),
    rim: drum(-0.15, 0.46, {
      tones: [tone(900, 0.03, 0.6), tone(2200, 0.02, 0.4, { wave: 'triangle' })],
      noise: noise('highpass', 5000, 0.008, 0.3),
    }),
    hat: drum(0.2, 0.22, {
      noise: noise('highpass', 8500, 0.07, 1, { q: 1 }),
      metal: metal(SQUARES, 'highpass', 9000, 0.06, 0.4),
    }),
    openHat: drum(0.2, 0.2, {
      noise: noise('highpass', 8000, 0.55, 1, { q: 1 }),
      metal: metal(SQUARES, 'highpass', 8500, 0.5, 0.4),
    }),
    tomLow: drum(-0.4, 0.8, {
      tones: [tone(100, 0.4, 1, { sweep: 1.2, sweepTime: 0.09 })],
      noise: noise('lowpass', 1500, 0.04, 0.15),
      drive: 0.2,
    }),
    tomMid: drum(0, 0.77, {
      tones: [tone(140, 0.35, 1, { sweep: 1.2, sweepTime: 0.08 })],
      noise: noise('lowpass', 1800, 0.04, 0.15),
      drive: 0.2,
    }),
    tomHigh: drum(0.4, 0.82, {
      tones: [tone(200, 0.3, 1, { sweep: 1.2, sweepTime: 0.07 })],
      noise: noise('lowpass', 2200, 0.04, 0.15),
      drive: 0.2,
    }),
    crash: drum(-0.3, 0.34, {
      noise: noise('highpass', 5500, 2, 0.8),
      metal: metal(SQUARES, 'highpass', 6000, 1.5, 0.5),
    }),
    ride: drum(0.35, 0.22, {
      metal: metal(SQUARES, 'bandpass', 7000, 1.3, 1, 1),
      noise: noise('highpass', 9000, 0.25, 0.3),
    }),
    cowbell: drum(0.25, 0.44, { metal: metal([587, 845], 'bandpass', 1500, 0.3, 1, 2) }),
    shaker: drum(-0.25, 0.34, {
      noise: noise('highpass', 7500, 0.09, 1, { attack: 0.008 }),
    }),
  },
);
