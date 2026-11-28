/**
 * A wiped layer, cut in time. A wipe is an effect, and a clip with an
 * effect is drawn through a surface of its own for as long as it has it —
 * so a layer that wipes on, or off, is cut into the stretch it wipes in,
 * the stretch it rests and the stretch it wipes out, and only the wiping
 * stretches carry the effect. At rest it costs what it would without one.
 * Isomorphic and pure.
 * @module utils/brand/element/wipeSlices
 */

/** @typedef {import('./timing.js').Timing} Timing */

const STILL = { type: 'none', by: 'block', duration: 0, stagger: 0, ease: 'linear' };
/** Shorter than this a stretch is not worth a clip of its own, seconds. */
const SLIVER = 1e-3;

/**
 * One stretch of a layer's clip.
 * @param {any} clip
 * @param {string} suffix - Added to the clip's id
 * @param {number} from
 * @param {number} to
 * @param {string[]} kept - Ids of the effects this stretch keeps
 * @returns {any}
 */
function stretch(clip, suffix, from, to, kept) {
  const first = from <= clip.timelineStart + SLIVER;
  const last = to >= clip.timelineEnd - SLIVER;
  const effects = clip.effects.filter((/** @type {any} */ fx) => kept.includes(fx.effectId));
  const keyframes = Object.fromEntries(
    Object.entries(clip.keyframes).filter(([path]) => {
      const [scope, id] = path.split('.');
      return scope !== 'effects' || kept.includes(id);
    }),
  );
  return {
    ...clip,
    clipId: `${clip.clipId}${suffix}`,
    ...{ timelineStart: from, timelineEnd: to, sourceIn: from, sourceOut: to },
    ...{ effects, keyframes },
    fadeIn: first ? Math.min(clip.fadeIn, to - from) : 0,
    fadeOut: last ? Math.min(clip.fadeOut, to - from) : 0,
    text: {
      ...clip.text,
      ...(!first && { animateIn: STILL }),
      ...(!last && { animateOut: STILL }),
    },
  };
}

/**
 * Cut a layer's clip so that it carries its wipes only while they run.
 * @param {any} clip - As `layerClip` made it, with `in` / `out` wipe effects or none
 * @param {Timing} timing
 * @returns {any[]} The clip itself when it does not wipe; otherwise its
 *   stretches, in time order
 */
export function wipeSlices(clip, timing) {
  const ids = clip.effects.map((/** @type {any} */ fx) => fx.effectId);
  if (!ids.length) return [clip];
  const { timelineStart: start, timelineEnd: end } = clip;
  const opened = ids.includes('in') && timing.enter ? Math.min(end, timing.enter.to) : start;
  const closing = ids.includes('out') && timing.exit ? Math.max(opened, timing.exit.from) : end;
  const pieces = [
    opened - start > SLIVER && stretch(clip, '-in', start, opened, ['in']),
    closing - opened > SLIVER && stretch(clip, '', opened, closing, []),
    end - closing > SLIVER && stretch(clip, '-out', closing, end, ['out']),
  ];
  return pieces.filter(Boolean);
}
