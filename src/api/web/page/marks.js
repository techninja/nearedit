/**
 * What the recorder draws besides the pointer: click ripples, highlights
 * (a ring, or a spotlight that dims everything else), and elements taken
 * out of view. All of it is stateless — every frame says in full what is
 * to be seen. Runs in the recorder's own world of the page; self-contained.
 * @module api/web/page/marks
 */

/**
 * @param {any} ne - The helpers' namespace in the page
 */
export function installMarks(ne) {
  /** Keep exactly `count` children of a kind in a part of the layer. */
  const pool = (/** @type {string} */ name, /** @type {number} */ count) => {
    const part = ne.part(name);
    while (part.children.length > count) part.lastChild.remove();
    while (part.children.length < count) part.append(document.createElement('div'));
    return [...part.children];
  };

  /**
   * Click ripples: a ring that grows and fades.
   * @param {{ x: number, y: number, p: number, size: number, color: string }[]} ripples - `p` runs 0..1
   */
  ne.drawRipples = (ripples) => {
    pool('ripples', ripples.length).forEach((el, i) => {
      const { x, y, p, size, color } = ripples[i];
      const radius = (7 + 21 * (1 - (1 - p) ** 2)) * size;
      el.className = 'ripple';
      el.style.cssText =
        `width:${radius * 2}px;height:${radius * 2}px;transform:translate(${x - radius}px,${y - radius}px);` +
        `border-color:${color};background:${color}33;opacity:${(1 - p) * 0.75}`;
    });
  };

  /**
   * Highlights around planned elements.
   * @param {{ plan: number, style: string, color: string, opacity: number }[]} marks
   */
  ne.drawMarks = (marks) => {
    const shown = marks.filter((mark) => ne.plans.get(mark.plan)?.el?.isConnected);
    pool('marks', shown.length).forEach((el, i) => {
      const { plan, style, color, opacity } = shown[i];
      const box = ne.box(ne.plans.get(plan).el);
      const pad = 6;
      const dim = style === 'spotlight' ? `0 0 0 200vmax rgba(15,23,42,${0.62 * opacity})` : 'none';
      el.className = 'mark';
      el.style.cssText =
        `width:${box.width + pad * 2}px;height:${box.height + pad * 2}px;` +
        `transform:translate(${box.x - pad}px,${box.y - pad}px);border-color:${color};` +
        `box-shadow:${dim}, 0 0 0 4px ${color}40;opacity:${style === 'spotlight' ? 1 : opacity};` +
        (style === 'spotlight' ? `border-color:${color}${alpha(opacity)}` : '');
    });
  };
  /** @type {(opacity: number) => string} Two hex digits of alpha. */
  const alpha = (opacity) =>
    Math.round(Math.max(0, Math.min(1, opacity)) * 255)
      .toString(16)
      .padStart(2, '0');

  /** Elements already taken out of view. */
  const gone = new WeakSet();
  let dirty = true;
  let watching = false;
  let known = '';

  /**
   * Take elements out of view and keep them out: a banner the page puts
   * back, or one that only appears later, goes as well.
   * @param {{ by: string, value: string, index: number }[]} targets
   */
  ne.hideAll = (targets) => {
    if (!targets.length) return;
    if (!watching && document.documentElement) {
      new MutationObserver(() => (dirty = true)).observe(document.documentElement, {
        ...{ childList: true, subtree: true, attributes: true },
        attributeFilter: ['class', 'style', 'hidden', 'open'],
      });
      watching = true;
    }
    const list = JSON.stringify(targets);
    if (!dirty && list === known) return;
    [dirty, known] = [false, list];
    for (const { by, value, index } of targets) {
      // A selector hides everything it matches; a text or a label the one that was meant.
      const all = by === 'css' && !index;
      const found = all ? ne.every(value) : ne.matches(by, value).list.slice(index, index + 1);
      for (const el of found) {
        if (gone.has(el) && el.style.display === 'none') continue;
        el.style.setProperty('display', 'none', 'important');
        gone.add(el);
      }
    }
    // Our own change must not count as the page's.
    Promise.resolve().then(() => (dirty = false));
  };
}
