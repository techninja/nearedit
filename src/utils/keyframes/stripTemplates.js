/**
 * The template of one row of the keyframe strip: the property's name, its
 * time axis with the stretch that is animated, the playhead, and a button
 * per key.
 * @module utils/keyframes/stripTemplates
 */

import { html } from 'hybrids';
import { formatTimecode } from '#utils/playback/timecode.js';
import { humanize } from './labels.js';
import { handleKeyClick } from './stripEvents.js';

/** @typedef {import('./stripEvents.js').KeyframeStripHost} KeyframeStripHost */

/** @type {(fraction: number) => string} */
const percent = (fraction) => `${(fraction * 100).toFixed(3)}%`;

/** @type {(value: number|string) => string} */
const shown = (value) =>
  typeof value === 'number' ? String(Math.round(value * 100) / 100) : value;

/**
 * @param {import('./strip.js').StripRow} row
 * @param {KeyframeStripHost} host
 * @param {number} now - Playhead as a fraction of the range
 * @returns {import('hybrids').UpdateFunctionWithMethods<KeyframeStripHost>}
 */
export function rowTemplate(row, { selected, fps }, now) {
  const first = row.keys[0]?.at ?? 0;
  const last = row.keys[row.keys.length - 1]?.at ?? 0;
  return html`
    <div class="keyframe-strip-row" role="listitem">
      <span
        class="keyframe-strip-label"
        title="${row.outside ? `${row.label} (${row.outside} more outside)` : row.label}"
        >${row.label}</span
      >
      <div class="keyframe-strip-track" data-path="${row.path}">
        <i
          class="keyframe-strip-span"
          style="${{ left: percent(first), width: percent(last - first) }}"
        ></i>
        ${now >= 0 && now <= 1
          ? html`<i class="keyframe-strip-now" style="${{ left: percent(now) }}"></i>`
          : html``}
        ${row.keys.map(
          (key) =>
            html`<button
              type="button"
              class="keyframe-strip-key"
              data-id="${key.id}"
              data-ease="${key.ease}"
              style="${{ left: percent(key.at) }}"
              aria-pressed="${selected.includes(key.id) ? 'true' : 'false'}"
              aria-label="${`${row.label} ${shown(key.v)} at ${formatTimecode(key.time, fps)}`}"
              title="${`${shown(key.v)} · ${formatTimecode(key.time, fps)} · ${humanize(key.ease)}`}"
              onclick="${handleKeyClick}"
            ></button>`,
        )}
      </div>
    </div>
  `;
}
