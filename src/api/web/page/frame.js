/**
 * The one call the recorder makes into the page for every frame: put the
 * scrolling boxes where this instant wants them, find out where the
 * pointer's target is now, draw the pointer and the marks, and report back.
 * Runs in the recorder's own world of the page; self-contained.
 * @module api/web/page/frame
 */

/**
 * @param {any} ne - The helpers' namespace in the page
 */
export function installFrame(ne) {
  /**
   * @param {Object} state - Everything this frame shows; nothing is remembered between frames
   * @param {{ plan: number, at: number[][] }[]} [state.scroll] - Scroll positions of plans
   * @param {number} [state.aim] - The plan the pointer is travelling to
   * @param {boolean} [state.snap] - The pointer has arrived: put it exactly on the target
   * @param {object|null} [state.cursor]
   * @param {object[]} [state.ripples]
   * @param {object[]} [state.marks]
   * @param {object[]} [state.hide]
   * @returns {object} What the recorder needs to know about this instant
   */
  ne.frame = (state) => {
    for (const { plan, at } of state.scroll || []) ne.scrollPlan(plan, at);
    ne.hideAll(state.hide || []);
    const aim = state.aim === undefined ? null : ne.aim(state.aim);
    const cursor = state.cursor || null;
    if (cursor && aim && state.snap) [cursor.x, cursor.y] = [aim.x, aim.y];
    ne.drawMarks(state.marks || []);
    ne.drawRipples(state.ripples || []);
    const hand = ne.drawCursor(cursor);
    const box = ne.scroller?.isConnected ? ne.scroller : document.scrollingElement;
    const now = document.timeline.currentTime;
    return {
      aim,
      hand,
      x: cursor ? cursor.x : null,
      y: cursor ? cursor.y : null,
      scrollY: box ? box.scrollTop : 0,
      // How far the frame clock is ahead of the page's own clock, milliseconds.
      drift: typeof now === 'number' ? now - performance.now() : 0,
    };
  };

  /**
   * Resolve a step's target and plan the scrolling that brings it into view.
   * @param {number} id - The step
   * @param {{ by: string, value: string, x?: number, y?: number }} target
   * @param {number} index
   * @param {{ align?: string, always?: boolean }} [how]
   * @returns {object} `{ why }` when there is nothing to aim at, otherwise
   *   `{ scrolls, rect, x, y, tag }` with the aiming point as it will be after scrolling
   */
  ne.resolve = (id, target, index, how = {}) => {
    if (target.by === 'point') {
      ne.plans.set(id, { el: null, boxes: [], to: [] });
      return { scrolls: [], rect: null, x: target.x, y: target.y, tag: '' };
    }
    const { el, why } = ne.find(target.by, target.value, index);
    if (!el) return { why };
    const scrolls = ne.plan(id, el, how.align || 'center', !!how.always);
    if (how.always) ne.scroller = ne.plans.get(id).boxes.at(-1);
    return { scrolls, ...ne.aim(id), tag: el.tagName.toLowerCase() };
  };

  /** Plan a scroll of the page itself (`top`, `bottom`, a position, a distance). */
  ne.resolvePage = (/** @type {number} */ id, /** @type {object} */ goal) => {
    const scrolls = ne.planPage(id, goal);
    ne.scroller = ne.plans.get(id).boxes[0];
    return { scrolls };
  };

  /**
   * Choose an option of a planned `<select>`, by value or by what it shows.
   * @param {number} id
   * @param {string} value
   * @returns {string} '' when done, otherwise what is wrong
   */
  ne.choose = (id, value) => {
    const el = ne.plans.get(id)?.el;
    if (!el?.isConnected || el.tagName !== 'SELECT') return 'the target is not a <select>';
    const wanted = String(value).trim().toLowerCase();
    const options = [...el.options];
    const option =
      options.find((o) => o.value === value) ||
      options.find((o) => o.text.trim().toLowerCase() === wanted) ||
      options.find((o) => o.text.trim().toLowerCase().includes(wanted));
    if (!option) return `it has no option ${JSON.stringify(value)}`;
    el.focus();
    if (el.value !== option.value || !option.selected) {
      option.selected = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return '';
  };
}
