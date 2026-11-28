/**
 * Where things are and how the page scrolls to them, inside the page. A
 * "plan" remembers an element, every scrolling box around it, and where
 * each has to scroll so that the element sits in view; the recorder then
 * moves the boxes a little every frame. Runs in the recorder's own world of
 * the page; self-contained.
 * @module api/web/page/geometry
 */

/**
 * @param {any} ne - The helpers' namespace in the page
 */
export function installGeometry(ne) {
  /** @type {Map<number, { el: Element|null, boxes: Element[], to: number[][] }>} */
  ne.plans = new Map();
  const root = () => document.scrollingElement || document.documentElement;
  const places = (/** @type {Element[]} */ boxes) => boxes.map((b) => [b.scrollLeft, b.scrollTop]);
  const put = (/** @type {Element} */ box, /** @type {number[]} */ [left, top]) =>
    box.scrollTo({ left, top, behavior: 'instant' });
  const scrolls = (/** @type {Element} */ el) => {
    const { overflowY, overflowX } = getComputedStyle(el);
    const can = (/** @type {string} */ o) => o === 'auto' || o === 'scroll' || o === 'overlay';
    return (
      (can(overflowY) && el.scrollHeight > el.clientHeight + 1) ||
      (can(overflowX) && el.scrollWidth > el.clientWidth + 1)
    );
  };

  ne.box = (/** @type {Element} */ el) => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  };

  /** The point to aim at: the middle, or the middle of the first line when that is what shows. */
  ne.point = (/** @type {Element} */ el) => {
    const lines = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    const middles = [el.getBoundingClientRect(), ...lines.slice(0, 1)].map((r) => ({
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
    }));
    const hits = (/** @type {{ x: number, y: number }} */ p) => {
      const hit = document.elementFromPoint(p.x, p.y);
      return !!hit && (el.contains(hit) || hit.contains(el));
    };
    return middles.find(hits) || middles[0];
  };

  /** The box an explicit scroll moves: the page, or — in an app that scrolls a panel — the biggest panel. */
  ne.mainScroller = () => {
    const page = root();
    if (page.scrollHeight > page.clientHeight + 1) return page;
    let best = page;
    let area = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (el.scrollHeight <= el.clientHeight + 1 || !ne.visible(el) || !scrolls(el)) continue;
      const size = el.clientWidth * el.clientHeight;
      if (size > area) [best, area] = [el, size];
    }
    return best;
  };

  /**
   * Plan how to bring an element into view.
   * @param {number} id - The step
   * @param {Element} el
   * @param {string} align - `start`, `center` or `end`
   * @param {boolean} always - Scroll even when the element is in view (a `scroll` step)
   * @returns {number[][]} Per scrolling box `[fromX, fromY, toX, toY]`
   */
  ne.plan = (id, el, align, always) => {
    /** @type {Element[]} */
    const boxes = [];
    for (let up = el.parentElement; up; up = up.parentElement) if (scrolls(up)) boxes.push(up);
    if (!boxes.includes(root())) boxes.push(root());
    const from = places(boxes);
    const { x, y } = ne.point(el);
    const margin = Math.min(64, innerHeight * 0.1);
    const inView = x >= 0 && x <= innerWidth && y >= margin && y <= innerHeight - margin;
    let to = from;
    if (always || !inView) {
      el.scrollIntoView({
        block: /** @type {any} */ (align),
        inline: 'nearest',
        behavior: 'instant',
      });
      to = places(boxes);
      boxes.forEach((box, i) => put(box, from[i]));
    }
    ne.plans.set(id, { el, boxes, to });
    return from.map((place, i) => [...place, ...to[i]]);
  };

  /**
   * Plan a scroll of the page itself.
   * @param {number} id
   * @param {{ to?: string, y?: number, by?: number }} goal
   * @returns {number[][]}
   */
  ne.planPage = (id, goal) => {
    const box = ne.mainScroller();
    const max = box.scrollHeight - box.clientHeight;
    const wanted =
      goal.to === 'top'
        ? 0
        : goal.to === 'bottom'
          ? max
          : (goal.y ?? box.scrollTop + (goal.by || 0));
    const top = Math.max(0, Math.min(max, wanted));
    ne.plans.set(id, { el: null, boxes: [box], to: [[box.scrollLeft, top]] });
    return [[box.scrollLeft, box.scrollTop, box.scrollLeft, top]];
  };

  /** Put the scrolling boxes of a plan where this frame wants them. */
  ne.scrollPlan = (/** @type {number} */ id, /** @type {number[][]} */ at) => {
    const plan = ne.plans.get(id);
    plan?.boxes.forEach((/** @type {Element} */ box, /** @type {number} */ i) => {
      if (at[i] && box.isConnected) put(box, at[i]);
    });
  };

  /**
   * Where a plan's element is, and where its aiming point will be once the
   * scrolling still to come is done.
   * @param {number} id
   * @returns {{ rect: object, x: number, y: number }|null} null when the element is gone
   */
  ne.aim = (id) => {
    const plan = ne.plans.get(id);
    if (!plan?.el?.isConnected) return null;
    const point = ne.point(plan.el);
    let [dx, dy] = [0, 0];
    plan.boxes.forEach((/** @type {Element} */ box, /** @type {number} */ i) => {
      dx += plan.to[i][0] - box.scrollLeft;
      dy += plan.to[i][1] - box.scrollTop;
    });
    return { rect: ne.box(plan.el), x: point.x - dx, y: point.y - dy };
  };
}
