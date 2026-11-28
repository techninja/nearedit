/**
 * Caption tile — a caption style at a glance: a sentence being said, drawn
 * by the caption drawing itself over something like footage. While
 * `playing` the sentence runs in a loop, in step with every other tile on
 * screen; otherwise it rests on one instant with a word marked. Draws again
 * when the style changes and when its font has arrived, and does nothing
 * while it is out of sight.
 * @module components/atoms/caption-tile
 */

import { define, html } from 'hybrids';
import { SAMPLE_STILL, TILE_ASPECT, drawTile, tileFontNeed } from '#utils/captionsUi/sample.js';
import { onTileTick } from '#utils/captionsUi/tileClock.js';

/**
 * @typedef {Object} CaptionTileHost
 * @property {string} preset - Name of the preset to show
 * @property {Record<string, any>} look - A style to show instead (stored or
 *   resolved); empty = the preset
 * @property {any[]} fonts - The document's own fonts
 * @property {boolean} playing - Run the sentence
 * @property {number} size - Width of the canvas's backing store, pixels
 */

/** @typedef {CaptionTileHost & HTMLElement} Host */

/** @type {WeakMap<HTMLElement, { stop: () => void, seen: boolean, font: string }>} */
const states = new WeakMap();

/** @param {Host} host @returns {unknown} The style the tile shows */
const styleOf = (host) => (Object.keys(host.look || {}).length ? host.look : host.preset);

/**
 * @param {Host} host
 * @param {number} time - Seconds into the sentence
 */
function draw(host, time) {
  const canvas = host.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (ctx) drawTile(ctx, styleOf(host), time, canvas, host.fonts);
}

/**
 * Make sure the style's font is there, then draw the resting instant.
 * @param {Host} host
 */
function settle(host) {
  const canvas = host.querySelector('canvas');
  const state = states.get(host);
  if (!canvas || !state) return;
  const need = tileFontNeed(styleOf(host), canvas.width, canvas.height, host.fonts);
  const fonts = document.fonts;
  if (need.font !== state.font && fonts && !fonts.check(need.font, need.text)) {
    fonts.load(need.font, need.text).then(
      () => {
        state.font = need.font;
        if (states.get(host) === state) draw(host, SAMPLE_STILL);
      },
      (err) => console.warn(`[captions] the font of a tile did not load: ${err.message}`),
    );
  } else state.font = need.font;
  draw(host, SAMPLE_STILL);
}

/** After every render: rest, or run with the shared clock. @param {Host} host */
function refresh(host) {
  const state = states.get(host);
  if (!state) return;
  state.stop();
  state.stop = () => {};
  settle(host);
  if (!host.playing) return;
  state.stop = onTileTick((seconds) => {
    if (state.seen) draw(host, seconds);
  });
}

/** @param {Host} host @returns {() => void} */
function connect(host) {
  const state = { stop: () => {}, seen: true, font: '' };
  states.set(host, state);
  const watcher = new IntersectionObserver((entries) => {
    state.seen = entries[entries.length - 1].isIntersecting;
  });
  watcher.observe(host);
  return () => {
    watcher.disconnect();
    state.stop();
    states.delete(host);
  };
}

/** @type {import('hybrids').Component<CaptionTileHost>} */
export default define({
  tag: 'caption-tile',
  preset: 'clean',
  look: { value: /** @type {any} */ ({}) },
  fonts: { value: [] },
  playing: false,
  size: 320,
  render: {
    value: ({ size, preset, look, fonts, playing }) =>
      html`<canvas
        width="${size}"
        height="${Math.round(size / TILE_ASPECT)}"
        data-preset="${preset}"
        data-playing="${playing ? 'true' : 'false'}"
        data-look="${Object.keys(look || {}).length}"
        data-fonts="${fonts.length}"
        aria-hidden="true"
      ></canvas>`,
    shadow: false,
    connect,
    observe: refresh,
  },
});
