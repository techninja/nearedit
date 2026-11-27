/**
 * Noise — animated fractal value noise mapped onto two to five colours:
 * clouds, smoke, plasma, a living background. The field is computed on a
 * small grid (its size depends on the detail asked for, never on the canvas)
 * and scaled up smoothly, so a frame costs a few milliseconds at any output
 * size and looks the same at every preview size.
 * @module utils/compose/generators/noise
 */

import { parseColor } from '#utils/compose/color.js';
import { noiseField } from './noiseField.js';

/** The grid is never wider or taller than this many samples. */
const MAX_GRID = 240;
/** Samples per wave of the finest octave. */
const SAMPLES_PER_WAVE = 4;
const MAX_COLORS = 5;
const COLORS = ['#0f172a', '#38bdf8', '#f472b6', '#fde047', '#ffffff'];

/** @type {import('#utils/compose/params.js').ParamSchema} */
const colorParams = {};
for (let i = 1; i <= MAX_COLORS; i++) {
  colorParams[`color${i}`] = {
    type: 'color',
    default: COLORS[i - 1],
    label: `Colour ${i}`,
    animatable: true,
    ...(i > 2 && { when: { colors: Array.from({ length: MAX_COLORS - i + 1 }, (_, k) => i + k) } }),
  };
}

/** @type {import('#utils/compose/catalog.js').GeneratorModule} */
export default {
  type: 'noise',
  label: 'Noise',
  category: 'background',
  description: 'Animated fractal noise between two or more colours',
  params: {
    scale: {
      type: 'number',
      default: 480,
      min: 8,
      max: 8000,
      unit: 'px',
      label: 'Feature size',
      animatable: true,
    },
    octaves: { type: 'number', default: 4, min: 1, max: 6, step: 1, label: 'Detail' },
    speed: {
      type: 'number',
      default: 0.25,
      min: 0,
      max: 10,
      step: 0.01,
      unit: '/s',
      label: 'Evolution',
    },
    driftX: { type: 'number', default: 0, min: -4000, max: 4000, unit: 'px/s', label: 'Drift X' },
    driftY: { type: 'number', default: 0, min: -4000, max: 4000, unit: 'px/s', label: 'Drift Y' },
    contrast: {
      type: 'number',
      default: 1.6,
      min: 0.1,
      max: 8,
      step: 0.05,
      label: 'Contrast',
      animatable: true,
    },
    balance: {
      type: 'number',
      default: 0,
      min: -1,
      max: 1,
      step: 0.01,
      label: 'Balance',
      animatable: true,
    },
    colors: { type: 'number', default: 2, min: 2, max: MAX_COLORS, step: 1, label: 'Colours' },
    ...colorParams,
  },
  draw(ctx, p, time, frame, env) {
    const { outWidth, outHeight } = frame;
    const octaves = Math.round(p.octaves);
    const finest = p.scale / 2 ** (octaves - 1);
    const cell = Math.max(finest / SAMPLES_PER_WAVE, Math.max(outWidth, outHeight) / MAX_GRID);
    const cols = Math.ceil(outWidth / cell) + 2;
    const rows = Math.ceil(outHeight / cell) + 2;
    const field = noiseField({
      cols,
      rows,
      cell,
      scale: p.scale,
      octaves,
      x: -p.driftX * time.t,
      y: -p.driftY * time.t,
      z: p.speed * time.t,
      seed: p.seed,
    });
    const count = Math.round(p.colors);
    const ramp = Array.from({ length: count }, (_, i) => parseColor(p[`color${i + 1}`]));
    const grid = env.scratch(cols, rows);
    const image = grid.ctx.createImageData(cols, rows);
    const data = image.data;
    for (let i = 0; i < field.length; i++) {
      const n = Math.max(0, Math.min(1, (field[i] - 0.5) * p.contrast + 0.5 + p.balance / 2));
      const at = Math.min(count - 2, Math.floor(n * (count - 1)));
      const mix = n * (count - 1) - at;
      const [a, b] = [ramp[at], ramp[at + 1]];
      data[i * 4] = a[0] + (b[0] - a[0]) * mix;
      data[i * 4 + 1] = a[1] + (b[1] - a[1]) * mix;
      data[i * 4 + 2] = a[2] + (b[2] - a[2]) * mix;
      data[i * 4 + 3] = (a[3] + (b[3] - a[3]) * mix) * 255;
    }
    grid.ctx.putImageData(image, 0, 0);
    // Sample i sits at the centre of texel i; map those centres onto the frame.
    const kx = (frame.width / outWidth) * cell;
    const ky = (frame.height / outHeight) * cell;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      grid.canvas,
      0.5,
      0.5,
      cols - 1,
      rows - 1,
      0,
      0,
      (cols - 1) * kx,
      (rows - 1) * ky,
    );
  },
};
