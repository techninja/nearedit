/**
 * Noise field — fractal value noise sampled on a regular grid. Each octave
 * is a lattice of random values blended smoothly in between; because the
 * samples lie on a grid, the lattice is tabulated once per octave and every
 * sample is four lookups. The third axis is time, so the field evolves
 * rather than slides. Pure.
 * @module utils/compose/generators/noiseField
 */

import { hash, rand } from '#utils/compose/random.js';

const fade = (/** @type {number} */ t) => t * t * (3 - 2 * t);

/** Scratch memory, reused between calls (it carries no meaning across frames). */
let buffer = new Float32Array(0);

/**
 * Lattice indices and blend weights of evenly spaced samples along one axis.
 * @param {number} count - Samples
 * @param {number} step - Lattice units between samples
 * @param {number} start - Lattice position of sample 0
 * @returns {{ base: number, cells: number, index: Int32Array, weight: Float32Array }}
 */
function axis(count, step, start) {
  const base = Math.floor(start);
  const index = new Int32Array(count);
  const weight = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const at = start + i * step;
    const cell = Math.floor(at);
    index[i] = cell - base;
    weight[i] = fade(at - cell);
  }
  return { base, cells: index[count - 1] + 2, index, weight };
}

/**
 * @typedef {Object} FieldSpec
 * @property {number} cols - Samples across
 * @property {number} rows - Samples down
 * @property {number} cell - Distance between samples
 * @property {number} scale - Size of the largest features, same unit as `cell`
 * @property {number} octaves
 * @property {number} x - Offset of sample 0 (drift), same unit as `cell`
 * @property {number} y
 * @property {number} z - Evolution: one unit is one lattice step in time
 * @property {number} seed
 */

/**
 * Sample the field.
 * @param {FieldSpec} spec
 * @returns {Float32Array} `cols × rows` values in 0..1, row by row. The array
 *   is reused by the next call
 */
export function noiseField({ cols, rows, cell, scale, octaves, x, y, z, seed }) {
  const count = cols * rows;
  if (buffer.length < count) buffer = new Float32Array(count);
  const out = buffer.subarray(0, count).fill(0);
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const wavelength = scale / 2 ** o;
    // An octave finer than two samples per wave cannot be drawn on this grid.
    if (o > 0 && wavelength < cell * 2) break;
    const weight = 1 / 2 ** o;
    total += weight;
    const xs = axis(cols, cell / wavelength, x / wavelength);
    const ys = axis(rows, cell / wavelength, y / wavelength);
    const zi = Math.floor(z);
    const zw = fade(z - zi);
    const [near, far] = [hash(seed, o, zi), hash(seed, o, zi + 1)];
    const table = new Float32Array(xs.cells * ys.cells);
    for (let j = 0; j < ys.cells; j++) {
      for (let i = 0; i < xs.cells; i++) {
        const a = rand(near, xs.base + i, ys.base + j);
        table[j * xs.cells + i] = a + (rand(far, xs.base + i, ys.base + j) - a) * zw;
      }
    }
    for (let r = 0; r < rows; r++) {
      const row = ys.index[r] * xs.cells;
      const v = ys.weight[r];
      for (let c = 0; c < cols; c++) {
        const at = row + xs.index[c];
        const u = xs.weight[c];
        const top = table[at] + (table[at + 1] - table[at]) * u;
        const below = table[at + xs.cells] + (table[at + xs.cells + 1] - table[at + xs.cells]) * u;
        out[r * cols + c] += weight * (top + (below - top) * v);
      }
    }
  }
  for (let i = 0; i < count; i++) out[i] /= total;
  return out;
}
