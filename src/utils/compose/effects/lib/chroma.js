/**
 * Chroma key arithmetic, on a plain RGBA array. A pixel's colour is reduced
 * to its chroma — the Cb / Cr pair of BT.601, which ignores how light or
 * dark it is — and its distance from the key colour's chroma decides how
 * much of it stays:
 *
 *   distance ≤ tolerance              → removed
 *   distance ≥ tolerance + softness   → kept
 *   between                           → kept in proportion (the soft edge)
 *
 * Distances are in units of the full 0..255 range: pure green is 0.53 from
 * any grey. Spill suppression then takes out of every surviving pixel the
 * part of its chroma that points towards the key (a green cast on skin or
 * hair), leaving its lightness alone.
 * Isomorphic and pure.
 * @module utils/compose/effects/lib/chroma
 */

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number[]} `[cb, cr]`, each about ±127.5
 */
export const chromaOf = (r, g, b) => [
  -0.168736 * r - 0.331264 * g + 0.5 * b,
  0.5 * r - 0.418688 * g - 0.081312 * b,
];

/**
 * How much of a colour a key leaves, before spill suppression.
 * @param {number[]} rgb - The pixel, 0..255
 * @param {number[]} key - The key colour, 0..255
 * @param {number} tolerance - 0..1
 * @param {number} softness - 0..1
 * @returns {number} 0 (removed) to 1 (kept)
 */
export function keptBy(rgb, key, tolerance, softness) {
  const [cb, cr] = chromaOf(rgb[0], rgb[1], rgb[2]);
  const [kb, kr] = chromaOf(key[0], key[1], key[2]);
  const distance = Math.hypot(cb - kb, cr - kr) / 255;
  if (distance <= tolerance) return 0;
  if (distance >= tolerance + softness) return 1;
  return (distance - tolerance) / softness;
}

/**
 * Key an image in place: one pass, no allocation.
 * @param {Uint8ClampedArray} data - RGBA, un-multiplied
 * @param {number[]} key - `[r, g, b]`, 0..255
 * @param {number} tolerance - 0..1
 * @param {number} softness - 0..1
 * @param {number} spill - 0..1
 */
export function keyPixels(data, key, tolerance, softness, spill) {
  const [kb, kr] = chromaOf(key[0], key[1], key[2]);
  const length = Math.hypot(kb, kr);
  // Unit vector of the key's chroma; a grey key has no direction to suppress.
  const ux = length > 1 ? kb / length : 0;
  const uy = length > 1 ? kr / length : 0;
  const near = tolerance * 255;
  const far = (tolerance + softness) * 255;
  const nearSq = near * near;
  const farSq = far * far;
  const slope = far > near ? 1 / (far - near) : 0;
  // What removing one unit of chroma along the key's direction does to R, G, B.
  const dr = -1.402 * uy * spill;
  const dg = (0.344136 * ux + 0.714136 * uy) * spill;
  const db = -1.772 * ux * spill;
  const despill = spill > 0 && length > 1;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
    const x = cb - kb;
    const y = cr - kr;
    const distanceSq = x * x + y * y;
    if (distanceSq <= nearSq) {
      data[i + 3] = 0;
      continue;
    }
    if (distanceSq < farSq)
      data[i + 3] = (alpha * (Math.sqrt(distanceSq) - near) * slope + 0.5) | 0;
    if (!despill) continue;
    const towards = cb * ux + cr * uy;
    if (towards <= 0) continue;
    // Whole numbers store quickly; the array clamps them to 0..255.
    data[i] = (r + towards * dr + 0.5) | 0;
    data[i + 1] = (g + towards * dg + 0.5) | 0;
    data[i + 2] = (b + towards * db + 0.5) | 0;
  }
}
