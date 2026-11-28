/**
 * Bar strip atom — the bars of a song as a row of cells, each on or off,
 * that can be painted: press to switch a bar, drag to paint on. The music
 * editor shows with it where a part plays. Reports `strip-paint` with
 * `{ bars, on, phase }` — `live` while painting, `commit` at the end.
 * @module components/atoms/music-bar-strip
 */

import { define, html } from 'hybrids';
import * as on from '#utils/musicUi/barStrip.js';

/** @type {import('hybrids').Component<import('#utils/musicUi/barStrip.js').BarStripHost>} */
export default define({
  tag: 'music-bar-strip',
  cells: { value: [] },
  locked: false,
  render: {
    value: ({ cells, locked }) =>
      html`<div
        class="music-bar-strip"
        role="group"
        aria-label="Bars in which it plays"
        onpointerdown="${on.handleDown}"
        onpointermove="${on.handleMove}"
        onpointerup="${on.handleUp}"
        onpointercancel="${on.handleUp}"
        onkeydown="${on.handleKeys}"
      >
        ${cells.map(
          ({ from, to, on: plays }, index) =>
            html`<button
              type="button"
              data-from="${from}"
              data-to="${to}"
              data-on="${plays}"
              data-fourth="${from % 4 === 0}"
              tabindex="${index === 0 ? 0 : -1}"
              aria-pressed="${plays ? 'true' : 'false'}"
              aria-label="${to - from > 1 ? `Bars ${from + 1} to ${to}` : `Bar ${from + 1}`}"
              disabled="${locked}"
            ></button>`,
        )}
      </div>`,
    shadow: false,
  },
});
