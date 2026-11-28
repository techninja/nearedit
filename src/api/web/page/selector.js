/**
 * A short CSS selector for one element, for the snapshot's list of things
 * to aim at: an id when it looks hand-written, otherwise an attribute that
 * names the element, otherwise its place in the structure. Runs in the
 * recorder's own world of the page; self-contained.
 * @module api/web/page/selector
 */

/**
 * @param {any} ne - The helpers' namespace in the page
 */
export function installSelector(ne) {
  const NAMING = [
    'data-testid',
    'data-test',
    'data-cy',
    'name',
    'aria-label',
    'placeholder',
    'alt',
  ];
  /** Ids a framework generated (":r1:", "ember123", a hash) change from load to load. */
  const stable = (/** @type {string} */ id) =>
    /^[a-z][\w-]*$/i.test(id) && !/\d{3,}|^(ember|react|radix|headlessui|mui)[-_]?\d/i.test(id);
  const only = (/** @type {string} */ selector, /** @type {Element} */ el) => {
    const found = document.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  };
  const quoted = (/** @type {string} */ value) => `"${value.replace(/["\\]/g, '\\$&')}"`;
  /** `tag:nth-of-type(n)`, without the number when the element has no like sibling. */
  const step = (/** @type {Element} */ el) => {
    const tag = el.localName;
    const like = [...(el.parentElement?.children || [])].filter((other) => other.localName === tag);
    return like.length > 1 ? `${tag}:nth-of-type(${like.indexOf(el) + 1})` : tag;
  };

  /**
   * @param {Element} el
   * @returns {string} A selector matching this element and no other; '' when none was found
   */
  ne.selectorOf = (el) => {
    const tag = el.localName;
    if (el.id && stable(el.id) && only(`#${CSS.escape(el.id)}`, el)) return `#${CSS.escape(el.id)}`;
    for (const name of NAMING) {
      const value = el.getAttribute(name);
      if (!value || value.length > 60 || /[\n\r]/.test(value)) continue;
      const selector = `${tag}[${name}=${quoted(value)}]`;
      if (only(selector, el)) return selector;
    }
    const href = tag === 'a' ? el.getAttribute('href') : '';
    if (href && href.length <= 80 && only(`a[href=${quoted(href)}]`, el))
      return `a[href=${quoted(href)}]`;
    // Structure: the shortest path, from the nearest ancestor with an id, that leads only here.
    let path = step(el);
    for (let up = el.parentElement; up && path.length < 400; up = up.parentElement) {
      if (only(path, el)) return path;
      if (up.id && stable(up.id) && only(`#${CSS.escape(up.id)} > ${path}`, el))
        return `#${CSS.escape(up.id)} > ${path}`;
      path = `${up === document.documentElement ? 'html' : step(up)} > ${path}`;
    }
    return only(path, el) ? path : '';
  };
}
