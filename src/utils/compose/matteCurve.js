/**
 * From a matte's brightness to transparency. A matte is grey: white where
 * the person is, black where the background is, and along the edge a ramp
 * about as wide as the matte model is unsure. No canvas operation turns
 * brightness into alpha, so this is the one pixel pass of a cutout — a
 * table look-up per pixel — and the table is where the edge is shaped:
 * each grey is read as a distance from the edge (the ramp of a blurred
 * step), the edge is moved, and the ramp is drawn again as wide as asked.
 * Black stays clear and white stays solid whatever the settings.
 * Isomorphic. Reference: docs/app-spec/CUTOUT.md § Drawing.
 * @module utils/compose/matteCurve
 */

/** Tables kept for the settings last used; a frame uses one or two. */
const MAX_TABLES = 16;

/**
 * The normal distribution's share below `x` — the ramp of a step blurred by
 * a Gaussian of deviation 1 (Abramowitz & Stegun 7.1.26, within 1e-7).
 * @param {number} x
 * @returns {number} 0..1
 */
function ramp(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const tail = 0.5 * poly * Math.exp(-z * z);
  return x < 0 ? tail : 1 - tail;
}

/**
 * How far from the edge each grey lies, in deviations of the ramp: the
 * inverse of `ramp`, found by halving. Black and white are infinitely far.
 * @returns {Float64Array} 256 entries
 */
function distances() {
  const table = new Float64Array(256);
  table[0] = -Infinity;
  table[255] = Infinity;
  for (let v = 1; v < 255; v++) {
    let [low, high] = [-8, 8];
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      if (ramp(mid) < v / 255) low = mid;
      else high = mid;
    }
    table[v] = (low + high) / 2;
  }
  return table;
}

const DISTANCE = distances();
/** @type {Map<string, Uint8Array>} */
const tables = new Map();

/**
 * The table that turns a matte's grey into alpha.
 * @param {number} gain - How much steeper the edge is drawn than the matte
 *   has it: 1 leaves the ramp as it is, 2 halves its width
 * @param {number} shift - How far the edge is pulled in (positive) or let
 *   out, in deviations of the edge as it is drawn
 * @returns {Uint8Array} 256 entries, alpha for each grey; with gain 1 and
 *   shift 0 every grey is its own alpha. Shared: do not change it
 */
export function matteCurve(gain, shift) {
  const key = `${gain}:${shift}`;
  let table = tables.get(key);
  if (table) return table;
  table = new Uint8Array(256);
  table[255] = 255;
  for (let v = 1; v < 255; v++) table[v] = Math.round(255 * ramp(gain * DISTANCE[v] - shift));
  if (tables.size >= MAX_TABLES) tables.delete(tables.keys().next().value);
  tables.set(key, table);
  return table;
}

/**
 * Give every pixel of an opaque grey surface the alpha its grey stands for.
 * Afterwards only the alpha of the surface means anything — use it with
 * `destination-in` or `source-in`.
 * @param {import('./pool.js').Surface} surface - Holds the matte
 * @param {Uint8Array} table - From `matteCurve`
 */
export function matteToAlpha(surface, table) {
  const { ctx, width, height } = surface;
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  // Green carries most of a grey's brightness and is not touched by chroma.
  for (let i = 1; i < data.length; i += 4) data[i + 2] = table[data[i]];
  ctx.putImageData(image, 0, 0);
}

/**
 * Replace a surface by one colour whose alpha is the surface's own alpha
 * seen through a table: what is drawn there becomes a flat shape.
 * @param {import('./pool.js').Surface} surface
 * @param {Uint8Array} table - From `matteCurve`
 * @param {number[]} color - `[r, g, b]`, 0..255
 */
export function alphaToShape(surface, table, [r, g, b]) {
  const { ctx, width, height } = surface;
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = table[data[i + 3]];
  }
  ctx.putImageData(image, 0, 0);
}
