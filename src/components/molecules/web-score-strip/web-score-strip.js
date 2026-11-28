/**
 * Score strip of the web editor — the whole recording as a small timeline:
 * the lead, every step's action and its hold, the tail, with the total
 * length. Press a block to select its step; drag the end of a block (or
 * focus it and use the arrow keys, Shift for ten frames) to change that
 * step's `duration` or `hold`, the `lead` or the `tail`, in whole frames.
 * While the recording plays the ruler on top is its scrubber. Events:
 * `web-select`, `web-retime`, `web-seek` (`#utils/webUi/stripEvents.js`).
 * @module components/molecules/web-score-strip
 */

import { define, html } from 'hybrids';
import { secondsLabel } from '#utils/webUi/stepRows.js';
import * as on from '#utils/webUi/stripEvents.js';

/** @typedef {import('#utils/webUi/stripEvents.js').ScoreStripHost} ScoreStripHost */

const NAMES = { lead: 'the lead', tail: 'the tail', duration: 'the action', hold: 'the hold' };

/**
 * @param {import('#utils/webUi/scoreStrip.js').StripBlock} block
 * @param {ScoreStripHost} host
 */
function blockTemplate(block, { selected, frozen, strip, locked }) {
  const seconds = block.end - block.start;
  const what =
    block.index >= 0 ? `${NAMES[block.part]} of step ${block.index + 1}` : NAMES[block.part];
  return html`<div
    class="${{
      'web-score-strip-block': true,
      [`is-${block.part}`]: true,
      'is-selected': block.index >= 0 && block.index === selected,
    }}"
    data-part="${block.part}"
    data-index="${block.index}"
    title="${`${block.label} · ${secondsLabel(seconds)}`}"
    style="${{ flex: frozen ? `0 0 ${seconds * frozen}px` : `${block.frames} 1 0px` }}"
    onclick="${on.handleSelect}"
  >
    ${block.part === 'duration'
      ? html`<span class="web-score-strip-name">${block.index + 1}</span>`
      : html``}
    <span
      class="web-score-strip-handle"
      role="slider"
      tabindex="${locked ? -1 : 0}"
      aria-label="${`Length of ${what}`}"
      aria-valuemin="0"
      aria-valuenow="${block.frames}"
      aria-valuetext="${`${secondsLabel(seconds)}, ${block.frames} frames`}"
      aria-orientation="horizontal"
      title="${`Drag to change the length of ${what} (${block.frames} frames at ${strip.fps} fps)`}"
      onpointerdown="${on.handleGrab}"
      onpointermove="${on.handleDrag}"
      onpointerup="${on.handleRelease}"
      onpointercancel="${on.handleRelease}"
      onkeydown="${on.handleKey}"
      onkeyup="${on.handleKeyEnd}"
      onblur="${on.handleKeyEnd}"
    ></span>
  </div>`.key(`${block.part}:${block.index}`);
}

/** @type {import('hybrids').Component<ScoreStripHost>} */
export default define({
  tag: 'web-score-strip',
  strip: { value: { blocks: [], duration: 0, frames: 0, fps: 30 } },
  selected: -1,
  playhead: -1,
  scrub: false,
  locked: false,
  frozen: 0,
  render: {
    value: (host) => {
      const { strip, playhead, scrub, frozen } = host;
      const at = strip.duration > 0 ? Math.min(1, Math.max(0, playhead / strip.duration)) : 0;
      return html`
        <div class="web-score-strip-head">
          <strong>Timing</strong>
          <span class="app-muted">Drag the end of a block to retime it</span>
          <span class="web-score-strip-total"
            >${secondsLabel(strip.duration)} · ${strip.frames} frames at ${strip.fps} fps</span
          >
        </div>
        <div class="${{ 'web-score-strip-track': true, 'is-frozen': frozen > 0 }}">
          <div
            class="${{ 'web-score-strip-ruler': true, 'is-scrub': scrub }}"
            title="${scrub ? 'Drag to move through the recording' : ''}"
            onpointerdown="${on.handleScrub}"
            onpointermove="${on.handleScrub}"
          ></div>
          <div class="web-score-strip-blocks">
            ${strip.blocks.map((block) => blockTemplate(block, host))}
          </div>
          ${playhead >= 0 && !frozen
            ? html`<div class="web-score-strip-playhead" style="${{ left: `${at * 100}%` }}"></div>`
            : html``}
        </div>
      `;
    },
    shadow: false,
  },
});
