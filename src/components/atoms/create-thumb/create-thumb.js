/**
 * Thumbnail — a small canvas showing what a generator or a text style
 * really looks like: it is drawn by the frame compositor from a one-clip
 * document. At rest it shows one moment; while `playing` it runs the
 * clip's animation in a loop.
 * @module components/atoms/create-thumb
 */

import { define, html } from 'hybrids';
import { drawThumb, onThumbAssets } from '#utils/create/thumbEnv.js';
import { thumbSize } from '#utils/create/thumbDoc.js';

/**
 * @typedef {Object} CreateThumbHost
 * @property {import('#utils/create/thumbDoc.js').ThumbSpec} spec - What to draw
 * @property {boolean} playing - Run the animation (the tile is hovered or focused)
 */

/** @typedef {CreateThumbHost & HTMLElement} Host */

/** @type {WeakMap<HTMLElement, number>} Animation frame of a playing thumbnail */
const loops = new WeakMap();

/**
 * @param {Host} host
 * @param {number} time - Timeline seconds of the thumbnail's document
 */
function draw(host, time) {
  const canvas = host.querySelector('canvas');
  if (canvas && host.spec?.doc) drawThumb(canvas, host.spec.doc, time);
}

/** @param {Host} host */
function stop(host) {
  cancelAnimationFrame(loops.get(host) || 0);
  loops.delete(host);
}

/**
 * After every render: show the resting moment, or start the loop.
 * @param {Host} host
 */
function refresh(host) {
  stop(host);
  if (!host.playing) return draw(host, host.spec?.still || 0);
  const started = performance.now();
  const tick = (/** @type {number} */ now) => {
    draw(host, ((now - started) / 1000) % (host.spec?.duration || 1));
    loops.set(host, requestAnimationFrame(tick));
  };
  loops.set(host, requestAnimationFrame(tick));
}

/**
 * Draw again when a font or an image the picture needs has loaded.
 * @param {Host} host
 * @returns {() => void}
 */
function connect(host) {
  const unsubscribe = onThumbAssets(() => {
    if (!host.playing) draw(host, host.spec?.still || 0);
  });
  return () => {
    unsubscribe();
    stop(host);
  };
}

/** @type {import('hybrids').Component<CreateThumbHost>} */
export default define({
  tag: 'create-thumb',
  spec: { value: /** @type {any} */ ({}) },
  playing: false,
  render: {
    value: ({ spec, playing }) => {
      const size = thumbSize(spec?.doc?.resolution);
      return html`<canvas
        width="${size.width}"
        height="${size.height}"
        data-playing="${playing ? 'true' : 'false'}"
        aria-hidden="true"
      ></canvas>`;
    },
    shadow: false,
    connect,
    observe: refresh,
  },
});
