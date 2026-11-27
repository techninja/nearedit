/**
 * Keyframe strip — the animation of the selected clip at a glance: one row
 * per animated property, its keys as diamonds along the clip's length and
 * the playhead as a line. Click a key to go there, drag to retime (several
 * selected keys move together, one undo step per drag), Delete removes,
 * the arrow keys nudge by a frame, and the toolbar sets the easing of the
 * selected keys. It edits the document through the edit session itself.
 * @module components/molecules/keyframe-strip
 */

import { define, html } from 'hybrids';
import { EASINGS } from '#utils/edl/easing.js';
import { humanize } from '#utils/keyframes/labels.js';
import { fractionAt, stripRange } from '#utils/keyframes/strip.js';
import { sharedEase } from '#utils/keyframes/stripEdit.js';
import * as on from '#utils/keyframes/stripEvents.js';
import * as keys from '#utils/keyframes/stripKeys.js';
import { rowTemplate } from '#utils/keyframes/stripTemplates.js';
import { selectedKeys } from '#utils/keyframes/stripSelection.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/keyframes/stripEvents.js').KeyframeStripHost} KeyframeStripHost */

/** @type {import('hybrids').Component<KeyframeStripHost>} */
export default define({
  tag: 'keyframe-strip',
  clip: { value: /** @type {any} */ ({}) },
  time: 0,
  fps: 30,
  locked: false,
  selected: { value: [] },
  fit: 'clip',
  collapsed: false,
  render: {
    value: (host) => {
      const { clip, time, locked, selected, fit, collapsed } = host;
      const rows = on.rowsOf(host);
      if (!rows.length) return html``;
      const range = stripRange(clip, fit);
      const chosen = selectedKeys(rows, selected);
      const ease = sharedEase(chosen);
      const total = rows.reduce((sum, row) => sum + row.keys.length + row.outside, 0);
      return html`
        <div class="keyframe-strip" data-collapsed="${collapsed ? 'true' : 'false'}">
          <header class="keyframe-strip-header">
            <button
              type="button"
              class="keyframe-strip-title"
              aria-expanded="${collapsed ? 'false' : 'true'}"
              onclick="${keys.handleCollapse}"
            >
              <app-icon name="${collapsed ? 'chevron' : 'chevron-down'}" size="sm"></app-icon>
              Keyframes <span class="chip">${total}</span>
            </button>
            <span class="toolbar-group">
              <select
                class="field-input keyframe-strip-ease"
                aria-label="Easing of the selected keyframes"
                title="Easing of the selected keyframes"
                disabled="${!chosen.length || locked}"
                onchange="${keys.handleEase}"
              >
                <option value="" selected="${!ease}" disabled>
                  ${chosen.length ? 'Mixed easing' : 'Easing'}
                </option>
                ${EASINGS.map(
                  (name) =>
                    html`<option value="${name}" selected="${name === ease}">
                      ${humanize(name)}
                    </option>`,
                )}
              </select>
              <button
                type="button"
                class="icon-btn"
                title="Delete the selected keyframes (Delete)"
                aria-label="Delete the selected keyframes"
                disabled="${!chosen.length || locked}"
                onclick="${keys.handleDelete}"
              >
                <app-icon name="keyframe-remove" size="sm"></app-icon>
              </button>
              <button
                type="button"
                class="icon-btn"
                aria-pressed="${fit === 'keys' ? 'true' : 'false'}"
                title="${fit === 'keys' ? 'Show the whole clip' : 'Zoom to the keyframes'}"
                aria-label="Zoom to the keyframes"
                onclick="${keys.handleFit}"
              >
                <app-icon name="zoom-fit" size="sm"></app-icon>
              </button>
            </span>
          </header>
          ${collapsed
            ? html``
            : html`<div
                class="keyframe-strip-rows"
                role="list"
                aria-label="Animated properties"
                onpointerdown="${on.handleDown}"
                onpointermove="${on.handleMove}"
                onpointerup="${on.handleUp}"
                onpointercancel="${on.handleUp}"
                onkeydown="${keys.handleKeys}"
                onkeyup="${keys.handleKeyUp}"
              >
                ${rows.map((row) => rowTemplate(row, host, fractionAt(range, time)))}
              </div>`}
        </div>
      `;
    },
    shadow: false,
  },
});
