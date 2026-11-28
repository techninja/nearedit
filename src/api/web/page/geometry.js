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
  /** @type {Map<number, { el: Element|null, boxes: Element[], to: number[][], offset: number[] }>} */
  ne.plans = new Map();
  const root = () => document.scrollingElement || document.documentElement;
  const places = (/** @type {Element[]} */ boxes) => boxes.map((b) => [b.scrollLeft, b.scrollTop]);
  const put = (/** @type {Element} */ box, /** @type {number[]} */ [left, top]) =>
    box.scrollTo({ left, top, behavior: 'instant' });
  const scrolls = (/** @type {Element} */ el) => {
    const { overflowY, overflowX } = getComputedStyle(el);
    // A box that hides what overflows cannot be scrolled by hand, but scrolling into view moves it.
    const can = (/** @type {string} */ o) => ['auto', 'scroll', 'overlay', 'hidden'].includes(o);
    return (
      (can(overflowY) && el.scrollHeight > el.clientHeight + 1) ||
      (can(overflowX) && el.scrollWidth > el.clientWidth + 1)
    );
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
   * Plan how to bring an element into view: where every scrolling box
   * around it has to be, and where the point to aim at will then lie.
   * @param {number} id - The step
   * @param {Element} el
   * @param {string} align - `start`, `center` or `end`
   * @param {boolean} always - Scroll even when the element is in view (a `scroll` step)
   * @param {boolean} pointed - The step points at it: it also has to be reachable, not covered
   * @returns {number[][]} Per scrolling box `[fromX, fromY, toX, toY]`
   */
  ne.plan = (id, el, align, always, pointed) => {
    /** @type {Element[]} */
    const boxes = [];
    for (let up = el.parentElement; up; up = up.parentElement) if (scrolls(up)) boxes.push(up);
    if (!boxes.includes(root())) boxes.push(root());
    const from = places(boxes);
    const reachable = () => !pointed || !ne.point(el).cover;
    // In view: all of it shows — or, when it is bigger than its window, its middle does.
    // (What is in view stays put: a sticky menu must not scroll the page to its origin.)
    const inView = () => {
      const { box, room, part } = ne.sight(el);
      if (!part) return false;
      const fits = box.width <= room.width + 0.5 && box.height <= room.height + 0.5;
      const [x, y] = [box.left + box.width / 2 - part.x, box.top + box.height / 2 - part.y];
      const whole = part.width > box.width - 0.5 && part.height > box.height - 0.5;
      return fits ? whole : x >= 0 && x <= part.width && y >= 0 && y <= part.height;
    };
    let to = from;
    if (always || !inView() || !reachable()) {
      // Scrolled only in the direction it is cut off in — to the middle, or where the step says.
      // Should something cover it there, any other place that leaves it clear will do.
      const { clear } = ne.sight(el);
      const first = always || !clear.y ? align : 'nearest';
      const others = always ? [] : ['center', 'nearest', 'start', 'end'];
      const tries = [[first, always || clear.x ? 'nearest' : 'center']];
      for (const block of others) tries.push([block, 'nearest']);
      for (const [i, [block, inline]] of /** @type {any[][]} */ (tries).entries()) {
        boxes.forEach((box, at) => put(box, from[at]));
        el.scrollIntoView({ block, inline, behavior: 'instant' });
        if (i === 0 || reachable()) to = places(boxes);
        if (reachable()) break;
      }
      boxes.forEach((box, i) => put(box, to[i]));
    }
    // Measured where everything will be, then put back: the recorder scrolls there frame by frame.
    const end = ne.point(el);
    const edge = el.getBoundingClientRect();
    boxes.forEach((box, i) => put(box, from[i]));
    ne.plans.set(id, { el, boxes, to, offset: [end.x - edge.left, end.y - edge.top] });
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
    ne.plans.set(id, { el: null, boxes: [box], to: [[box.scrollLeft, top]], offset: [0, 0] });
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
   * Where a plan's element is, and the point to aim at: while boxes still
   * have to scroll, where that point will be when they are done; once the
   * pointer has arrived, the point as it is — with what covers it, if anything.
   * @param {number} id
   * @param {boolean} [arrived]
   * @returns {{ rect: object, x: number, y: number, cover: string }|null} null when the element is gone
   */
  ne.aim = (id, arrived) => {
    const plan = ne.plans.get(id);
    if (!plan?.el?.isConnected) return null;
    let [dx, dy] = [0, 0];
    plan.boxes.forEach((/** @type {Element} */ box, /** @type {number} */ i) => {
      dx += plan.to[i][0] - box.scrollLeft;
      dy += plan.to[i][1] - box.scrollTop;
    });
    const rect = ne.box(plan.el);
    if (arrived || Math.abs(dx) + Math.abs(dy) < 1) return { rect, ...ne.point(plan.el) };
    return { rect, x: rect.x + plan.offset[0] - dx, y: rect.y + plan.offset[1] - dy, cover: '' };
  };
}
