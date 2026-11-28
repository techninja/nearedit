/**
 * Target resolution, inside the page (WEBCLIP.md § Targets). This function
 * is turned into text and runs in the recorder's own JavaScript world of
 * the page, so it may use nothing from outside itself — and nothing the
 * page's scripts have redefined can reach it.
 * @module api/web/page/targets
 */

/**
 * @param {any} ne - The helpers' namespace in the page
 */
export function installTargets(ne) {
  const INTERACTIVE =
    'a[href],button,input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],' +
    '[role="menuitem"],[role="option"],[role="checkbox"],[role="radio"],[role="switch"],[onclick],' +
    '[contenteditable=""],[contenteditable="true"]';
  const CONTROLS =
    'input:not([type="hidden"]),textarea,select,button,[contenteditable=""],[contenteditable="true"],' +
    '[role="textbox"],[role="searchbox"],[role="combobox"],[role="listbox"],[role="checkbox"],' +
    '[role="radio"],[role="switch"],[role="slider"],[role="spinbutton"]';
  const SILENT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'SVG']);
  /** Case and spacing do not count. */
  const norm = (/** @type {any} */ text) =>
    String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  /** An element that takes up room on the page — in view or below the fold. */
  ne.visible = (/** @type {Element} */ el) => {
    if (!el.isConnected || !el.checkVisibility({ visibilityProperty: true })) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  ne.interactive = (/** @type {Element} */ el) => el.matches(INTERACTIVE);

  /** The text an element shows, case and spacing ignored. */
  const shown = (/** @type {any} */ el) => {
    const known = ne.texts?.get(el);
    if (known !== undefined) return known;
    let text = el.textContent;
    if (SILENT.has(el.tagName.toUpperCase())) text = '';
    else if (el.tagName === 'INPUT') text = /^(button|submit|reset)$/.test(el.type) ? el.value : '';
    text = norm(text);
    ne.texts?.set(el, text);
    return text;
  };
  ne.norm = norm;
  ne.shown = shown;

  /** Elements showing a text: [exact matches, matches that only contain it], document order. */
  const byText = (/** @type {string} */ wanted) => {
    /** @type {Element[][]} */
    const [exact, partial] = [[], []];
    const walk = (/** @type {Element} */ el) => {
      const text = shown(el);
      if (!text.includes(wanted)) return false;
      const at = text === wanted ? exact.length : -1;
      if (at >= 0) exact.push(el);
      let inner = false;
      for (const child of el.children) inner = walk(child) || inner;
      // The innermost element is the one "showing" the text — unless a link
      // or a button wraps it: that is what a person would aim at.
      if (at >= 0 && inner && !ne.interactive(el)) exact.splice(at, 1);
      if (at < 0 && !inner) partial.push(el.closest(INTERACTIVE) || el);
      return true;
    };
    if (document.body) walk(document.body);
    const outer = exact.filter((el) => !exact.some((other) => other !== el && other.contains(el)));
    return [outer, [...new Set(partial)]];
  };

  /** Form controls by what they are called: [exact, containing]. */
  const byLabel = (/** @type {string} */ wanted) => {
    /** @type {Element[][]} */
    const [exact, partial] = [[], []];
    for (const el of /** @type {any} */ (document.querySelectorAll(CONTROLS))) {
      const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
      const names = [
        ...Array.from(el.labels || [], (/** @type {Element} */ label) => label.textContent),
        ...ids.map((id) => document.getElementById(id)?.textContent),
        ...['aria-label', 'placeholder', 'name', 'title'].map((name) => el.getAttribute(name)),
      ].map(norm);
      if (names.includes(wanted)) exact.push(el);
      else if (names.some((name) => name.includes(wanted))) partial.push(el);
    }
    return [exact, partial];
  };

  /**
   * Every match of a target, best first: visible before hidden, exact
   * before containing, links and controls before plain text, then document order.
   */
  ne.matches = (/** @type {string} */ by, /** @type {string} */ value) => {
    /** @type {Element[][]} */
    let tiers;
    if (by === 'css') {
      try {
        tiers = [[...document.querySelectorAll(value)]];
      } catch {
        return { list: [], error: `${JSON.stringify(value)} is not a CSS selector` };
      }
    } else tiers = (by === 'label' ? byLabel : byText)(norm(value));
    const rank = (/** @type {Element[]} */ list, /** @type {boolean} */ seen) => {
      const some = list.filter((el) => ne.visible(el) === seen);
      return by === 'text'
        ? [...some.filter(ne.interactive), ...some.filter((el) => !ne.interactive(el))]
        : some;
    };
    const ranked = [true, false].flatMap((seen) => tiers.map((tier) => rank(tier, seen)));
    // "index: 1" counts within the best kind of match that exists.
    return { list: ranked.find((tier) => tier.length) || [], error: '' };
  };

  /** Find one element: `{ el, count, why }` — `why` says what is wrong when `el` is null. */
  ne.find = (/** @type {string} */ by, /** @type {string} */ value, index = 0) => {
    const { list, error } = ne.matches(by, value);
    const el = list[index] || null;
    const what = `${by}=${value}`;
    let why = '';
    if (error) why = error;
    else if (!list.length) why = `nothing on the page matches ${what}`;
    else if (!el) why = `${what} matches ${list.length} element(s); there is no number ${index}`;
    else if (!ne.visible(el)) why = `${what} is on the page but not shown`;
    return { el: why ? null : el, count: list.length, why };
  };
}
