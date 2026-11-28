/**
 * Brand frame — a picture of a brand element large enough to judge a look
 * by: the element's one-clip document drawn by the frame compositor, as
 * wide as the place it is given and sharp at that size. At rest it shows
 * one moment; while `playing` it runs the element's motion in a loop. It
 * draws again when the document changes (a token was set) and when a font
 * or a logo it was waiting for has arrived.
 * @module components/atoms/brand-frame
 */

import { define, html } from 'hybrids';
import { thumbCrop, thumbSize } from '#utils/create/thumbDoc.js';
import { drawThumb, onThumbAssets } from '#utils/create/thumbEnv.js';

/**
 * @typedef {Object} BrandFrameHost
 * @property {import('#utils/create/thumbDoc.js').ThumbSpec} spec - What to draw
 * @property {boolean} playing - Run the motion (the picture is pointed at or focused)
 * @property {number} size - Longest side of the canvas's backing store, pixels
 */

/** @typedef {BrandFrameHost & HTMLElement} Host */

/** @type {WeakMap<HTMLElement, number>} Animation frame of a playing picture */
const loops = new WeakMap();

/** @param {Host} host @param {number} time - Seconds into the picture's document */
function draw(host, time) {
  const canvas = host.querySelector('canvas');
  if (canvas && host.spec?.doc) drawThumb(canvas, host.spec.doc, time);
}

/** @param {Host} host */
function stop(host) {
  cancelAnimationFrame(loops.get(host) || 0);
  loops.delete(host);
}

/** After every render: show the resting moment, or start the loop. @param {Host} host */
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

/** Draw again when a font or a picture has loaded. @param {Host} host @returns {() => void} */
function connect(host) {
  const unsubscribe = onThumbAssets(() => {
    if (!host.playing) draw(host, host.spec?.still || 0);
  });
  return () => {
    unsubscribe();
    stop(host);
  };
}

/** @type {import('hybrids').Component<BrandFrameHost>} */
export default define({
  tag: 'brand-frame',
  spec: { value: /** @type {any} */ ({}) },
  playing: false,
  size: 480,
  render: {
    value: ({ spec, playing, size }) => {
      // A picture that shows a part of its frame has the shape of that part.
      const part = thumbCrop(spec?.doc);
      const shape = part ? `${Math.round(part.width)}x${Math.round(part.height)}` : '';
      const backing = thumbSize(shape || spec?.doc?.resolution, size, size);
      return html`<canvas
        width="${backing.width}"
        height="${backing.height}"
        data-playing="${playing ? 'true' : 'false'}"
        aria-hidden="true"
      ></canvas>`;
    },
    shadow: false,
    connect,
    observe: refresh,
  },
});
