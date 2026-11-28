/**
 * The matte the fake matte program answers with, so a test can say what a
 * cutout's right half must hold. Not a test file itself.
 * @module tests/cutout/shapes
 */

/**
 * The ellipse every test knows: centred, a quarter of the width and a third
 * of the height in radius.
 * @param {number} w
 * @param {number} h
 * @returns {Buffer} One byte a pixel: 255 inside, 0 outside
 */
export function ellipse(w, h) {
  const matte = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [dx, dy] = [(x + 0.5 - w / 2) / (w / 4), (y + 0.5 - h / 2) / (h / 3)];
      if (dx * dx + dy * dy <= 1) matte[y * w + x] = 255;
    }
  }
  return matte;
}
