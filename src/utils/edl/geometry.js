/**
 * Clip geometry — the one implementation of the placement
 * algorithm in docs/app-spec/EDL.md. The preview compositor and the FFmpeg
 * renderer both call these so what you see is what renders.
 * Isomorphic and pure.
 * @module utils/edl/geometry
 */

const lerp = (a, b, p) => a + (b - a) * p;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * @typedef {Object} FlatTransform
 * @property {'cover'|'contain'} fit
 * @property {number} x
 * @property {number} y
 * @property {number} scaleX
 * @property {number} scaleY
 * @property {number} rotation
 * @property {number} opacity
 * @property {number} cropTop
 * @property {number} cropBottom
 * @property {number} cropLeft
 * @property {number} cropRight
 * @property {number} anchorX
 * @property {number} anchorY
 */

/**
 * Progress through a clip, 0 at its start to 1 at its end.
 * @param {{ timelineStart: number, timelineEnd: number }} clip
 * @param {number} time - Timeline seconds
 * @returns {number}
 */
export function clipProgress(clip, time) {
  const duration = clip.timelineEnd - clip.timelineStart;
  return duration > 0 ? clamp01((time - clip.timelineStart) / duration) : 0;
}

/**
 * The transform in effect at a moment, with ken burns already applied.
 * Pass the clip as `resolveClip` returned it: a property that is keyframed
 * (`clip.keyframes['transform.x']`…) keeps its keyframed value, ken burns
 * drives only the properties that are not. Opacity and crops are clamped
 * to 0..1, since an overshooting easing may carry a keyframed value past
 * its range.
 * @param {{ transform?: any, keyframes?: Record<string, any> }} clip
 * @param {number} [progress=0] - 0..1 through the clip
 * @returns {FlatTransform}
 */
export function resolveTransform(clip, progress = 0) {
  const t = clip.transform || {};
  const flat = {
    fit: t.fit === 'contain' ? 'contain' : 'cover',
    x: t.x ?? 0,
    y: t.y ?? 0,
    scaleX: t.scaleX ?? 1,
    scaleY: t.scaleY ?? 1,
    rotation: t.rotation ?? 0,
    opacity: clamp01(t.opacity ?? 1),
    cropTop: clamp01(t.cropTop ?? 0),
    cropBottom: clamp01(t.cropBottom ?? 0),
    cropLeft: clamp01(t.cropLeft ?? 0),
    cropRight: clamp01(t.cropRight ?? 0),
    anchorX: t.anchorX ?? 0.5,
    anchorY: t.anchorY ?? 0.5,
  };
  const kb = t.kenBurns;
  if (!kb?.enabled) return /** @type {FlatTransform} */ (flat);
  const p = clamp01(progress);
  const scale = lerp(kb.startScale ?? 1, kb.endScale ?? 1, p);
  const moved = {
    x: lerp(kb.startX ?? 0, kb.endX ?? 0, p),
    y: lerp(kb.startY ?? 0, kb.endY ?? 0, p),
    scaleX: scale,
    scaleY: scale,
    cropTop: lerp(kb.startCropTop ?? 0, kb.endCropTop ?? 0, p),
    cropBottom: lerp(kb.startCropBottom ?? 0, kb.endCropBottom ?? 0, p),
    cropLeft: lerp(kb.startCropLeft ?? 0, kb.endCropLeft ?? 0, p),
    cropRight: lerp(kb.startCropRight ?? 0, kb.endCropRight ?? 0, p),
  };
  const keyed = clip.keyframes || {};
  for (const key of Object.keys(moved)) if (keyed[`transform.${key}`]?.length) delete moved[key];
  return /** @type {FlatTransform} */ ({ ...flat, ...moved });
}

/**
 * Where a source lands in the output frame (before rotation).
 * `s*` is the source rectangle to read, `d*` the destination rectangle, all
 * in pixels: source pixels for `s*`, output-resolution pixels for `d*`.
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} outW
 * @param {number} outH
 * @param {FlatTransform} t
 * @returns {{ sx: number, sy: number, sw: number, sh: number,
 *   dx: number, dy: number, dw: number, dh: number }}
 */
export function placeSource(srcW, srcH, outW, outH, t) {
  const sx = t.cropLeft * srcW;
  const sy = t.cropTop * srcH;
  const sw = Math.max(1, srcW * (1 - t.cropLeft - t.cropRight));
  const sh = Math.max(1, srcH * (1 - t.cropTop - t.cropBottom));
  const fit = t.fit === 'contain' ? Math.min(outW / sw, outH / sh) : Math.max(outW / sw, outH / sh);
  const dw = sw * fit * t.scaleX;
  const dh = sh * fit * t.scaleY;
  return { sx, sy, sw, sh, dx: (outW - dw) / 2 + t.x, dy: (outH - dh) / 2 + t.y, dw, dh };
}
