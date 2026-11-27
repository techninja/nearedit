/**
 * Pixel passes — for the few effects no filter or composite operation can
 * express (a key, a channel split, quantised levels). The whole surface is
 * read once, changed in a typed array and written back once, at whatever
 * size the canvas has: a preview pays for its own pixels, not the render's.
 * Colours arrive un-multiplied (0..255 per channel, alpha apart), as
 * `getImageData` gives them on both canvases.
 * Isomorphic.
 * @module utils/compose/effects/lib/pixels
 */

/**
 * Read a surface, let `edit` change its pixels in place, write them back.
 * @param {import('#utils/compose/pool.js').Surface} surface
 * @param {(data: Uint8ClampedArray, width: number, height: number) => void} edit
 */
export function editPixels(surface, edit) {
  const { ctx, width, height } = surface;
  const image = ctx.getImageData(0, 0, width, height);
  edit(image.data, width, height);
  ctx.putImageData(image, 0, 0);
}

/**
 * Map every colour channel of every visible pixel through a table.
 * @param {Uint8ClampedArray} data - RGBA
 * @param {Uint8Array|Uint8ClampedArray} table - 256 entries
 */
export function mapChannels(data, table) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = table[data[i]];
    data[i + 1] = table[data[i + 1]];
    data[i + 2] = table[data[i + 2]];
  }
}
