/**
 * What a frame shows besides the page itself: where each scrolling box is,
 * where the pointer is on its way, which ripples and highlights are on.
 * The scene keeps the pointer and the ripples between frames; everything
 * else is worked out from the acts in play. Motion comes from `#utils/web`.
 * @module api/web/scene
 */

import { glide, parseTarget, scrollAt } from '#utils/web/index.js';

/** @typedef {import('./acts.js').Act} Act */

const RIPPLE_SECONDS = 0.45;
const progress = (/** @type {number} */ n, /** @type {number} */ from, /** @type {number} */ to) =>
  to > from ? Math.min(1, Math.max(0, (n - from) / (to - from))) : 1;

/**
 * @param {import('#utils/web/types.js').Recipe} recipe - Normalised
 * @param {number} fps
 * @returns {{ pointer: { x: number, y: number, shown: boolean },
 *   hide: { by: string, value: string, index: number }[],
 *   at: (n: number, acts: Act[]) => { state: any, held: string },
 *   still: () => object, forget: (step: number) => void }} `at` gives the state the page
 *   draws on frame `n` and the mouse button held on it; `still` the state between frames;
 *   `forget` drops what a step that turned out impossible had begun to draw
 */
export function createScene(recipe, fps) {
  const { width, height } = recipe.viewport;
  const { style, size, color, clicks } = recipe.cursor;
  // The pointer comes in from just below the picture the first time it is needed.
  const pointer = { x: width * 0.62, y: height + 24, shown: false };
  const hide = recipe.hide
    .map(parseTarget)
    .filter((target) => target && target.by !== 'point')
    .map((target) => ({ by: target.by, value: target.value, index: 0 }));
  /** @type {{ x: number, y: number, at: number, step: number }[]} */
  let ripples = [];
  const rippleFrames = Math.max(2, Math.round(RIPPLE_SECONDS * fps));
  const drawn = (/** @type {boolean} */ down) =>
    pointer.shown ? { x: pointer.x, y: pointer.y, style, size, color, down } : null;

  return {
    pointer,
    hide,
    still: () => ({ hide, cursor: drawn(false) }),
    forget: (step) => void (ripples = ripples.filter((ripple) => ripple.step !== step)),
    at(n, acts) {
      /** @type {any} */
      const state = { hide, scroll: [], marks: [] };
      for (const act of acts) {
        // What scrolls is in place when the pointer gets there — for typing that is before the
        // keys, not when the last one has been struck — or, without a pointer, when the action ends.
        const settled = act.G ?? act.A;
        const p = progress(n, act.S, settled);
        const places = (n <= settled ? act.scrolls || [] : []).map(([fx, fy, tx, ty]) => [
          scrollAt(fx, tx, p, act.ease),
          scrollAt(fy, ty, p, act.ease),
        ]);
        if (places.length) state.scroll.push({ plan: act.plan, at: places });
        const mark = act.mark?.(n);
        if (mark) state.marks.push(mark);
        // A step that does not move the pointer still reports where its target is.
        if (act.plan !== undefined && act.G === undefined && n <= act.A) state.aim ??= act.plan;
        if (act.G === undefined || n > act.G) continue;
        act.from ||= { x: pointer.x, y: pointer.y };
        const along = progress(n, act.S, act.G);
        Object.assign(pointer, glide(act.from, act.aim || act.from, along, act.ease));
        pointer.shown = true;
        Object.assign(state, { aim: act.plan, snap: along >= 1 });
      }
      const pressing = acts.find((act) => act.down?.some(([from, to]) => n >= from && n < to));
      for (const act of acts) {
        const known = ripples.some((ripple) => ripple.at === n && ripple.step === act.step);
        if (act.ripple?.includes(n) && !known)
          ripples.push({ x: pointer.x, y: pointer.y, at: n, step: act.step });
      }
      ripples = ripples.filter((ripple) => n - ripple.at < rippleFrames);
      state.cursor = drawn(!!pressing);
      state.ripples = (clicks && style !== 'none' ? ripples : []).map(({ x, y, at }) => ({
        ...{ x, y, size, color },
        p: (n - at) / rippleFrames,
      }));
      const button = pressing && /** @type {any} */ (recipe.steps[pressing.step]).button;
      return { state, held: pressing ? button || 'left' : '' };
    },
  };
}
