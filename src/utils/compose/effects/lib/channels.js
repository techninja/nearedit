/**
 * Channel split arithmetic, on plain RGBA arrays: red is read from one side
 * of each pixel, blue from the other, green stays put — the fringes of a
 * cheap lens or a worn tape.
 *
 * A layer has one alpha for three channels, so the split is done on colour
 * × alpha (what each channel actually contributes) and the result takes the
 * largest of the three alphas: an opaque picture stays opaque, an evenly
 * translucent area keeps its alpha, and a fringe that leaves the layer's
 * edge is as solid as the channel that made it. Offsets are fractional —
 * each shifted channel is interpolated between four pixels — so the split
 * grows smoothly when animated and a small preview matches the render; at
 * the frame's border the edge pixels repeat.
 * Isomorphic and pure.
 * @module utils/compose/effects/lib/channels
 */

/**
 * Split an offset into whole pixels and four interpolation weights.
 * @param {number} dx - Offset, pixels
 * @param {number} dy
 * @returns {{ x: number, y: number, weights: number[] }} The whole part, and
 *   the weights (in 256ths, adding up to 256) of the pixels at `(x, y)`,
 *   `(x + 1, y)`, `(x, y + 1)` and `(x + 1, y + 1)`
 */
export function tapsFor(dx, dy) {
  const x = Math.floor(dx);
  const y = Math.floor(dy);
  // Sixteenths of a pixel each way, so the four products are whole 256ths.
  const fx = Math.round((dx - x) * 16);
  const fy = Math.round((dy - y) * 16);
  return { x, y, weights: [(16 - fx) * (16 - fy), fx * (16 - fy), (16 - fx) * fy, fx * fy] };
}

/**
 * Byte offsets within a row: for every x, where `x + shift` (kept inside
 * the row) is.
 * @param {number} width
 * @param {number} shift - Whole pixels
 * @returns {Int32Array}
 */
function columnOffsets(width, shift) {
  const out = new Int32Array(width);
  for (let x = 0; x < width; x++) out[x] = Math.max(0, Math.min(width - 1, x + shift)) * 4;
  return out;
}

/**
 * @param {Uint8ClampedArray} data - RGBA
 * @returns {boolean} True when no pixel is transparent at all
 */
function isOpaque(data) {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false;
  return true;
}

/**
 * Write the split of `from` into `to`.
 * @param {Uint8ClampedArray} to - RGBA, zeroed, same size as `from`
 * @param {Uint8ClampedArray} from - RGBA, un-multiplied
 * @param {number} width
 * @param {number} height
 * @param {number} dx - Red is read `(dx, dy)` back, blue `(dx, dy)` ahead; pixels
 * @param {number} dy
 */
export function splitChannels(to, from, width, height, dx, dy) {
  const taps = tapsFor(dx, dy);
  const [w0, w1, w2, w3] = taps.weights;
  // Red is read behind each pixel, blue ahead of it: two columns and two rows each.
  const redX0 = columnOffsets(width, -taps.x);
  const redX1 = columnOffsets(width, -taps.x - 1);
  const blueX0 = columnOffsets(width, taps.x);
  const blueX1 = columnOffsets(width, taps.x + 1);
  const rowOf = (/** @type {number} */ y) => Math.max(0, Math.min(height - 1, y)) * width * 4;
  const opaque = isOpaque(from);
  const whole = w0 === 256;
  for (let y = 0; y < height; y++) {
    const redY0 = rowOf(y - taps.y);
    const redY1 = rowOf(y - taps.y - 1);
    const blueY0 = rowOf(y + taps.y);
    const blueY1 = rowOf(y + taps.y + 1);
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      const r0 = redY0 + redX0[x];
      const r1 = redY0 + redX1[x];
      const r2 = redY1 + redX0[x];
      const r3 = redY1 + redX1[x];
      const b0 = blueY0 + blueX0[x] + 2;
      const b1 = blueY0 + blueX1[x] + 2;
      const b2 = blueY1 + blueX0[x] + 2;
      const b3 = blueY1 + blueX1[x] + 2;
      // Alphas of the taps (red's are 3 bytes on, blue's 1) and of the pixel itself.
      const solid =
        opaque ||
        (from[r0 + 3] & from[r1 + 3] & from[r2 + 3] & from[r3 + 3] & from[i + 3]) +
          (from[b0 + 1] & from[b1 + 1] & from[b2 + 1] & from[b3 + 1]) ===
          510;
      if (solid) {
        // Opaque all round — all of a footage frame: no alpha arithmetic.
        to[i] = whole
          ? from[r0]
          : (from[r0] * w0 + from[r1] * w1 + from[r2] * w2 + from[r3] * w3 + 128) >> 8;
        to[i + 1] = from[i + 1];
        to[i + 2] = whole
          ? from[b0]
          : (from[b0] * w0 + from[b1] * w1 + from[b2] * w2 + from[b3] * w3 + 128) >> 8;
        to[i + 3] = 255;
        continue;
      }
      // Weighted alphas, scaled by 256.
      const ar0 = from[r0 + 3] * w0;
      const ar1 = from[r1 + 3] * w1;
      const ar2 = from[r2 + 3] * w2;
      const ar3 = from[r3 + 3] * w3;
      const ab0 = from[b0 + 1] * w0;
      const ab1 = from[b1 + 1] * w1;
      const ab2 = from[b2 + 1] * w2;
      const ab3 = from[b3 + 1] * w3;
      const green = from[i + 3] * 256;
      const alpha = Math.max(ar0 + ar1 + ar2 + ar3, green, ab0 + ab1 + ab2 + ab3);
      if (alpha === 0) continue;
      // Colour × alpha of each channel, divided by the alpha they come to share.
      to[i] = (from[r0] * ar0 + from[r1] * ar1 + from[r2] * ar2 + from[r3] * ar3) / alpha;
      to[i + 1] = (from[i + 1] * green) / alpha;
      to[i + 2] = (from[b0] * ab0 + from[b1] * ab1 + from[b2] * ab2 + from[b3] * ab3) / alpha;
      to[i + 3] = alpha / 256;
    }
  }
}
