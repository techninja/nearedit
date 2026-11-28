/**
 * The recorder's own layer over the page: a host element with a closed
 * shadow root, so no style sheet of the page reaches what is drawn in it,
 * kept in the browser's top layer so it stays above modal dialogs too. It
 * never takes an event. Runs in the recorder's own world of the page;
 * self-contained.
 * @module api/web/page/overlay
 */

/**
 * @param {any} ne - The helpers' namespace in the page
 */
export function installOverlay(ne) {
  // Hot spot of every shape is the origin: the arrow's tip, the fingertip, the dot's middle.
  const SHAPES = {
    arrow: '<path d="M0 0v16.6l4.4-4 3.2 7.2 2.9-1.3-3.2-7h6z"/>',
    hand:
      '<g transform="translate(-8 -2)"><path d="M6 14V4a2 2 0 0 1 4 0v5a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v1a2 2 0 0 1 ' +
      '4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L6 14z"/>' +
      '<path d="M10 9v4.5M14 10v3.5M18 11v2.5" fill="none"/></g>',
    dot: '<circle r="8" fill-opacity=".85"/>',
  };
  const CSS = `
    :host { all: initial; }
    div, svg { position: fixed; left: 0; top: 0; margin: 0; pointer-events: none; box-sizing: border-box; }
    svg { overflow: visible; width: 1px; height: 1px; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.4)); }
    svg * { stroke: #fff; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; }
    .ripple { border-radius: 50%; border: 2px solid; }
    .mark { border: 3px solid; border-radius: 8px; }`;
  const PINNED =
    'all:initial;position:fixed;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0;' +
    'overflow:visible;background:none;display:block;pointer-events:none;z-index:2147483647;';
  /** @type {any} */
  let host = null;
  /** @type {any} */
  let layer = null;
  let above = '';

  /** The layer, created on first use and put back whenever the page removed it. */
  ne.layer = () => {
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.setAttribute('popover', 'manual');
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = CSS;
      layer = document.createElement('div');
      shadow.append(style, layer);
    }
    // Inline and !important: the one place where the page's own rules could interfere.
    const pinned = PINNED.replace(/;/g, ' !important;');
    if (host.style.cssText !== pinned) host.style.cssText = pinned;
    if (!host.isConnected && document.documentElement) {
      document.documentElement.append(host);
      above = '';
    }
    const top = [...document.querySelectorAll(':modal, :popover-open, :fullscreen')];
    const others = String(top.filter((el) => el !== host).length);
    // The top layer is ordered by arrival: show again after anything the page put there.
    if (host.isConnected && others !== above) {
      try {
        if (host.matches(':popover-open')) host.hidePopover();
        host.showPopover();
      } catch {
        host.removeAttribute('popover'); // no top layer here: the highest z-index has to do
      }
      above = others;
    }
    return layer;
  };

  /** One element of the layer by name, made on first use. */
  ne.part = (/** @type {string} */ name, tag = 'div') => {
    const all = ne.layer();
    let part = all.querySelector(`[data-part="${name}"]`);
    if (!part) {
      part =
        tag === 'svg'
          ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          : document.createElement(tag);
      part.setAttribute('data-part', name);
      all.append(part);
    }
    return part;
  };

  /**
   * Draw the pointer.
   * @param {{ x: number, y: number, style: string, size: number, color: string, down: boolean }|null} cursor
   * @returns {boolean} True when it is drawn as a hand
   */
  ne.drawCursor = (cursor) => {
    const svg = ne.part('cursor', 'svg');
    if (!cursor || cursor.style === 'none') {
      svg.style.display = 'none';
      return false;
    }
    const under = document.elementFromPoint(cursor.x, cursor.y);
    const hand =
      cursor.style === 'arrow' && !!under && getComputedStyle(under).cursor === 'pointer';
    const shape = hand ? 'hand' : cursor.style === 'dot' ? 'dot' : 'arrow';
    if (svg.getAttribute('data-shape') !== shape) {
      svg.innerHTML = SHAPES[shape];
      svg.setAttribute('data-shape', shape);
    }
    const scale = cursor.size * 1.15 * (cursor.down ? 0.86 : 1);
    svg.style.cssText = `display:block;fill:${cursor.color};transform:translate(${cursor.x}px,${cursor.y}px) scale(${scale})`;
    return hand;
  };
}
