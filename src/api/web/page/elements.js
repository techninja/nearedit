/**
 * What a person — or the director — can aim at on a page: links, buttons,
 * form controls, headings, images that say what they show, and sections
 * with a heading. Each comes with a target that was tried here and finds
 * exactly that element. Runs in the recorder's own world of the page;
 * self-contained.
 * @module api/web/page/elements
 */

/**
 * @param {any} ne - The helpers' namespace in the page
 */
export function installElements(ne) {
  const BUTTON =
    'button,summary,input[type="button"],input[type="submit"],input[type="reset"],input[type="image"],' +
    '[role="button"],[role="tab"],[role="menuitem"]';
  const CONTROL =
    'input:not([type="hidden"]),textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"],' +
    '[role="searchbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="switch"],[role="slider"]';
  const SECTION =
    'main,nav,header,footer,aside,section,article,form,dialog,[role="main"],[role="navigation"],' +
    '[role="banner"],[role="contentinfo"],[role="complementary"],[role="region"],[role="search"],[role="dialog"]';
  const HEADING = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
  /** Kinds in the order they are tried: a button inside a form is a button, not a section. */
  const KINDS = [
    ['link', 'a[href],[role="link"]'],
    ['button', BUTTON],
    ['input', CONTROL],
    ['heading', HEADING],
    ['image', 'img[alt]:not([alt=""]),[role="img"][aria-label]'],
    ['section', SECTION],
  ];
  const short = (/** @type {any} */ text) =>
    String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  const labelled = (/** @type {Element} */ el) => {
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return short(ids.map((id) => document.getElementById(id)?.textContent || '').join(' '));
  };

  /** What an element is called, by kind. */
  const nameOf = (/** @type {string} */ kind, /** @type {any} */ el) => {
    const said = el.getAttribute('aria-label') || labelled(el);
    if (kind === 'input')
      return short(el.labels?.[0]?.textContent || said || el.placeholder || el.name || el.type);
    if (kind === 'image') return short(el.alt || said);
    if (kind === 'section') return short(said || el.querySelector(HEADING)?.textContent);
    return short(
      el.textContent || el.value || said || el.title || el.querySelector('img[alt]')?.alt || '',
    );
  };

  /** The target that finds exactly this element: its text or label when no other shares it, else a selector. */
  const targetOf = (
    /** @type {string} */ kind,
    /** @type {string} */ name,
    /** @type {Element} */ el,
  ) => {
    const by = kind === 'input' ? 'label' : kind === 'section' || kind === 'image' ? '' : 'text';
    if (by && name && name.length <= 60) {
      const { list } = ne.matches(by, name);
      if (list.length === 1 && list[0] === el) return `${by}=${name}`;
    }
    const selector = ne.selectorOf(el);
    return selector && ne.find('css', selector).el === el ? selector : '';
  };

  /**
   * @param {number} [limit]
   * @returns {{ kind: string, name: string, target: string, visible: boolean,
   *   rect: { x: number, y: number, width: number, height: number } }[]} In
   *   document order; `rect` in page CSS pixels, `visible` = showing now (not scrolled away
   *   and not cut off by a panel around it)
   */
  ne.elements = (limit = 300) => {
    ne.texts = new WeakMap(); // texts are read many times while targets are tried
    const all = KINDS.map(([, selector]) => selector).join(',');
    const out = [];
    try {
      for (const el of document.querySelectorAll(all)) {
        if (out.length >= limit) break;
        if (!ne.visible(el)) continue;
        const kind = /** @type {string[]} */ (
          KINDS.find(([, selector]) => el.matches(selector))
        )[0];
        const name = nameOf(kind, el);
        // A section nobody named is furniture; so is a link without words.
        if (!name) continue;
        const target = targetOf(kind, name, el);
        if (!target) continue;
        const box = el.getBoundingClientRect();
        out.push({
          ...{ kind, name, target },
          rect: { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height },
          visible: ne.showing(el),
        });
      }
    } finally {
      ne.texts = null;
    }
    return out;
  };

  /** Facts about the page as it stands, for the snapshot and the track. */
  ne.pageFacts = () => {
    const root = document.scrollingElement || document.documentElement;
    return {
      url: location.href,
      title: document.title,
      page: { width: root.scrollWidth, height: root.scrollHeight },
      scrollY: root.scrollTop,
    };
  };
}
