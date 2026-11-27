/**
 * Preview sizing — fit the program frame into its container and choose the
 * canvas backing-store size. Pure and isomorphic.
 * @module utils/playback/previewSize
 */

/** Backing-store budget: a 1080p frame. More only costs fill rate. */
export const MAX_PREVIEW_PIXELS = 1920 * 1080;

/**
 * @typedef {Object} PreviewSize
 * @property {number} cssWidth - Displayed width, CSS px
 * @property {number} cssHeight - Displayed height, CSS px
 * @property {number} width - Canvas backing-store width, device px
 * @property {number} height - Canvas backing-store height, device px
 */

/**
 * Largest frame of the output aspect ratio that fits the container, and a
 * backing store matching the screen's pixel density — but never finer than
 * the output resolution itself, nor beyond the pixel budget.
 * @param {number} boxWidth - Container width, CSS px
 * @param {number} boxHeight - Container height, CSS px
 * @param {number} outWidth - Output (adaptation) width, px
 * @param {number} outHeight - Output (adaptation) height, px
 * @param {number} [pixelRatio=1] - window.devicePixelRatio
 * @param {number} [maxPixels=MAX_PREVIEW_PIXELS]
 * @returns {PreviewSize}
 */
export function fitPreview(
  boxWidth,
  boxHeight,
  outWidth,
  outHeight,
  pixelRatio = 1,
  maxPixels = MAX_PREVIEW_PIXELS,
) {
  const aspect = outWidth > 0 && outHeight > 0 ? outWidth / outHeight : 16 / 9;
  const boxW = Math.max(0, boxWidth || 0);
  const boxH = Math.max(0, boxHeight || 0);
  const cssWidth = Math.max(1, Math.floor(Math.min(boxW, boxH * aspect)));
  const cssHeight = Math.max(1, Math.floor(Math.min(boxH, boxW / aspect)));
  const ratio = pixelRatio > 0 ? pixelRatio : 1;
  let scale = Math.min(ratio, outWidth / cssWidth || ratio);
  const pixels = cssWidth * scale * (cssHeight * scale);
  if (pixels > maxPixels) scale *= Math.sqrt(maxPixels / pixels);
  return {
    cssWidth,
    cssHeight,
    width: Math.max(1, Math.round(cssWidth * scale)),
    height: Math.max(1, Math.round(cssHeight * scale)),
  };
}
