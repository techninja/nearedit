/**
 * What of an element actually shows, inside the page. An element's box may
 * lie within the picture and still not be painted: a scrolling panel around
 * it cuts it off. And what shows may not be what a click reaches: something
 * else can lie on top. Both are answered here, for the scroll plans, for the
 * order targets are tried in, and for the snapshot's `visible`. Runs in the
 * recorder's own world of the page; self-contained.
 * @module api/web/page/sight
 */

/**
 * @param {any} ne - The helpers' namespace in the page
 */
export function installSight(ne) {
  ne.box = (/** @type {Element} */ el) => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  };

  /** A few words that name an element in a message: `<div#chat.bubble> "Talk to us"`. */
  ne.describe = (/** @type {Element|null} */ el) => {
    if (!el) return 'the edge of the picture';
    const classes = [...el.classList].slice(0, 2).map((name) => `.${name}`);
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const words = text.length > 40 ? `${text.slice(0, 39)}…` : text;
    return `<${el.localName}${el.id ? `#${el.id}` : ''}${classes.join('')}>${words ? ` "${words}"` : ''}`;
  };

  /**
   * An element's box, the window it shows through — the picture, cut down by
   * every box around it that clips its content — and what is left of it.
   * @param {Element} el
   * @returns {{ box: DOMRect, room: { width: number, height: number }, clear: { x: boolean, y: boolean },
   *   part: { x: number, y: number, width: number, height: number }|null, cut: Element|null }}
   *   `part` is null when nothing of it shows; `cut` is then the box that hides it (null: the
   *   picture's own edge)
   */
  ne.sight = (el) => {
    const box = el.getBoundingClientRect();
    let [left, top, right, bottom] = [0, 0, innerWidth, innerHeight];
    const shows = () =>
      Math.min(box.right, right) - Math.max(box.left, left) >= 1 &&
      Math.min(box.bottom, bottom) - Math.max(box.top, top) >= 1;
    let cut = null;
    let position = getComputedStyle(el).position;
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
      if (position === 'fixed') break; // placed in the picture itself
      const style = getComputedStyle(up);
      // A box placed absolutely is only cut by the boxes it is placed in.
      if (position === 'absolute' && style.position === 'static') continue;
      position = style.position;
      const [cutX, cutY] = [style.overflowX !== 'visible', style.overflowY !== 'visible'];
      if (!cutX && !cutY) continue;
      const showed = shows();
      const edge = up.getBoundingClientRect();
      const [x, y] = [edge.left + up.clientLeft, edge.top + up.clientTop];
      if (cutX) [left, right] = [Math.max(left, x), Math.min(right, x + up.clientWidth)];
      if (cutY) [top, bottom] = [Math.max(top, y), Math.min(bottom, y + up.clientHeight)];
      if (showed && !shows()) cut = up;
    }
    const room = { width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    // Along which direction nothing of it is cut off.
    const clear = {
      x: box.left > left - 0.5 && box.right < right + 0.5,
      y: box.top > top - 0.5 && box.bottom < bottom + 0.5,
    };
    if (!shows()) return { box, room, clear, part: null, cut };
    const [x, y] = [Math.max(box.left, left), Math.max(box.top, top)];
    const part = {
      x,
      y,
      width: Math.min(box.right, right) - x,
      height: Math.min(box.bottom, bottom) - y,
    };
    return { box, room, clear, part, cut: null };
  };

  /** Showing: rendered, and enough of it inside its window to be seen — 4 px each way, or all of it. */
  ne.showing = (/** @type {Element} */ el) => {
    if (!ne.visible(el)) return false;
    const { box, part } = ne.sight(el);
    return !!part && part.width >= Math.min(4, box.width) && part.height >= Math.min(4, box.height);
  };

  /** Would a click on `hit` be a click on `el`: itself, something inside it, the link, button or label around it. */
  const reaches = (/** @type {Element} */ hit, /** @type {any} */ el) =>
    el.contains(hit) ||
    !!ne.owner(hit)?.contains(el) ||
    Array.from(el.labels || []).some((/** @type {Element} */ label) => label.contains(hit));

  /**
   * The point to aim at: the middle of the part that shows — or, when
   * something lies on top there, another point of it that can be reached.
   * @param {Element} el
   * @returns {{ x: number, y: number, cover: string }} `cover` is '' when a click there reaches
   *   the element; otherwise what is in the way, as the end of a sentence: "is covered by …"
   */
  ne.point = (el) => {
    const { box, part, cut } = ne.sight(el);
    const area = part || ne.box(el);
    const at = (/** @type {number} */ fx, /** @type {number} */ fy) => ({
      x: area.x + area.width * fx,
      y: area.y + area.height * fy,
    });
    if (!part) {
      const why = cut ? `it is cut off by ${ne.describe(cut)}` : 'it lies outside the picture';
      return { ...at(0.5, 0.5), cover: `cannot be brought into view: ${why}` };
    }
    // Text that wraps shows on its first line, not in the middle of its box.
    const line = [...el.getClientRects()].find((r) => r.width > 0 && r.height > 0) || box;
    const first = { x: line.x + line.width / 2, y: line.y + line.height / 2 };
    const inPart = first.x > area.x && first.x < area.x + area.width && first.y > area.y;
    const spots = [at(0.5, 0.5), ...(inPart && first.y < area.y + area.height ? [first] : [])];
    for (const f of [0.25, 0.75]) spots.push(at(f, 0.5), at(0.5, f), at(f, f), at(f, 1 - f));
    let onTop = null;
    for (const spot of spots) {
      const hit = document.elementFromPoint(spot.x, spot.y);
      if (hit && reaches(hit, el)) return { ...spot, cover: '' };
      onTop ||= hit;
    }
    return { ...spots[0], cover: `is covered by ${ne.describe(onTop)}` };
  };
}
