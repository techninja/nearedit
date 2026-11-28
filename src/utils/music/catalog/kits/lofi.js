/**
 * Lo-fi: drums as an old sampler would play them back — pitched down,
 * short, dark, with the grit of a low sample rate and few bits. The grit is
 * meant: these drums fold high tones back on purpose.
 * @module utils/music/catalog/kits/lofi
 */

import { drum, kit, metal, noise, tone } from './build.js';

const TIN = [237, 348, 411, 566, 613, 889];
/** The sampler: its sample rate and bit depth. */
const DUST = { rate: 12000, bits: 9 };
const GRIT = { rate: 14000, bits: 8 };

export default kit(
  'lofi',
  'Lo-fi',
  'Dusty and dark: short thuds and soft ticks from an old sampler',
  {
    kick: drum(0, 1.17, {
      tones: [tone(56, 0.38, 1, { sweep: 2.2, sweepTime: 0.06 })],
      noise: noise('lowpass', 1800, 0.015, 0.3),
      drive: 0.5,
      lowpass: 3500,
      crush: DUST,
    }),
    snare: drum(0, 0.89, {
      tones: [tone(170, 0.15, 0.5, { sweep: 0.3, sweepTime: 0.03 })],
      noise: noise('bandpass', 2300, 0.2, 0.9),
      drive: 0.3,
      lowpass: 6500,
      crush: DUST,
    }),
    clap: drum(0.05, 1.58, {
      noise: noise('bandpass', 1300, 0.25, 1, { q: 1.3, bursts: 3, gap: 0.012 }),
      lowpass: 6000,
      crush: DUST,
    }),
    rim: drum(-0.15, 0.54, {
      tones: [tone(620, 0.04, 0.6), tone(1400, 0.025, 0.4, { wave: 'triangle' })],
      crush: DUST,
    }),
    hat: drum(0.2, 0.42, {
      noise: noise('bandpass', 6000, 0.045, 1, { q: 1 }),
      crush: GRIT,
    }),
    openHat: drum(0.2, 0.3, {
      noise: noise('bandpass', 5500, 0.3, 1, { q: 0.8 }),
      crush: GRIT,
    }),
    tomLow: drum(-0.4, 0.83, {
      tones: [tone(85, 0.36, 1, { sweep: 1, sweepTime: 0.1 })],
      drive: 0.3,
      lowpass: 4000,
      crush: DUST,
    }),
    tomMid: drum(0, 0.81, {
      tones: [tone(118, 0.32, 1, { sweep: 1, sweepTime: 0.09 })],
      drive: 0.3,
      lowpass: 4500,
      crush: DUST,
    }),
    tomHigh: drum(0.4, 0.86, {
      tones: [tone(160, 0.28, 1, { sweep: 1, sweepTime: 0.08 })],
      drive: 0.3,
      lowpass: 5000,
      crush: DUST,
    }),
    crash: drum(-0.3, 0.44, {
      noise: noise('bandpass', 5000, 1.4, 0.8, { q: 0.5 }),
      metal: metal(TIN, 'highpass', 3500, 1.2, 0.5),
      lowpass: 7000,
      crush: DUST,
    }),
    ride: drum(0.35, 0.25, {
      metal: metal(TIN, 'bandpass', 4500, 1, 1, 1),
      crush: GRIT,
    }),
    cowbell: drum(0.25, 0.41, {
      metal: metal([520, 770], 'bandpass', 1100, 0.22, 1, 2),
      crush: DUST,
    }),
    shaker: drum(-0.25, 0.73, {
      noise: noise('bandpass', 5200, 0.08, 1, { q: 1, attack: 0.01 }),
      crush: GRIT,
    }),
  },
);
