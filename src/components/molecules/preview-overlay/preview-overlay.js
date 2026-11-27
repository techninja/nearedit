/**
 * Preview overlay — direct manipulation on the program monitor. It lies
 * over the picture and, while playback is stopped, draws the box of the
 * selected clip that is in the frame at the playhead, with a corner handle
 * on each corner and a rotate handle above it; snap guides while dragging;
 * and, on request, the title-safe and action-safe areas. Pressing the
 * picture selects the clip under the pointer. The box follows exactly the
 * geometry the compositor draws with and scales with the preview.
 * @module components/molecules/preview-overlay
 */

import { define, html, store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { parseResolution } from '#utils/edl/factory.js';
import { liveDoc } from '#utils/editor/liveDoc.js';
import { onSizeKnown } from '#utils/preview/layerBox.js';
import * as on from '#utils/preview/overlayEvents.js';
import * as keys from '#utils/preview/overlayKeys.js';
import { boxStyle, guideStyle, overlayTarget } from '#utils/preview/overlayModel.js';
import { SAFE_AREAS } from '#utils/preview/snap.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/preview/overlayEvents.js').PreviewOverlayHost} PreviewOverlayHost */

const CORNERS = ['nw', 'ne', 'se', 'sw'];

/**
 * Redraw when a still has been measured or a font has loaded: both change
 * where a box is.
 * @param {PreviewOverlayHost & HTMLElement} host
 * @returns {() => void}
 */
function watchSizes(host) {
  const bump = () => {
    host.revision += 1;
  };
  const stop = onSizeKnown(bump);
  document.fonts?.addEventListener?.('loadingdone', bump);
  return () => {
    stop();
    document.fonts?.removeEventListener?.('loadingdone', bump);
  };
}

/** @type {import('hybrids').Component<PreviewOverlayHost>} */
export default define({
  tag: 'preview-overlay',
  doc: liveDoc(),
  view: store(ViewState),
  sizes: { value: {} },
  guides: { value: [] },
  safe: {
    value: false,
    connect: (host) => {
      host.safe = keys.storedSafe();
    },
  },
  revision: { value: 0, connect: watchSizes },
  render: {
    value: (host) => {
      const { doc, view, guides, safe } = host;
      const out = parseResolution(doc.resolution);
      const time = view.playheadPosition;
      const target = view.playing
        ? null
        : overlayTarget(doc, view.selection || [], time, on.boxerOf(host, time));
      const editable = target && !target.locked;
      const name = target?.layer.clip.label || target?.layer.kind || '';
      return html`
        <div
          class="preview-overlay"
          data-revision="${host.revision}"
          onpointerdown="${on.handleDown}"
          onpointermove="${on.handleMove}"
          onpointerup="${on.handleUp}"
          onpointercancel="${on.handleUp}"
        >
          ${safe
            ? SAFE_AREAS.map(
                (area) =>
                  html`<div
                    class="preview-overlay-safe"
                    data-area="${area.id}"
                    title="${area.label}"
                    style="${{ inset: `${area.inset * 100}%` }}"
                  ></div>`,
              )
            : html``}
          ${guides.map(
            (guide) =>
              html`<i class="preview-overlay-guide" style="${guideStyle(guide, out)}"></i>`,
          )}
          ${target
            ? html`<div
                class="preview-overlay-box"
                data-locked="${target.locked ? 'true' : 'false'}"
                tabindex="${editable && target.movable ? 0 : -1}"
                role="group"
                aria-label="${`${name} in the frame: drag to move, arrow keys to nudge`}"
                style="${boxStyle(target.box, out)}"
                onkeydown="${keys.handleKeys}"
                onkeyup="${keys.handleKeyUp}"
              >
                ${editable && target.movable
                  ? CORNERS.map(
                      (corner) =>
                        html`<span
                          class="preview-overlay-handle"
                          data-handle="scale"
                          data-corner="${corner}"
                          title="Drag to scale (Shift: width and height separately)"
                        ></span>`,
                    )
                  : html``}
                ${editable
                  ? html`<span
                      class="preview-overlay-handle preview-overlay-rotate"
                      data-handle="rotate"
                      title="Drag to rotate (Shift: 15° steps)"
                    ></span>`
                  : html``}
              </div>`
            : html``}
          <button
            type="button"
            class="icon-btn preview-overlay-safe-toggle"
            aria-pressed="${safe ? 'true' : 'false'}"
            title="${safe ? 'Hide the safe areas' : 'Show title-safe and action-safe areas'}"
            aria-label="Safe areas"
            onclick="${keys.handleSafe}"
          >
            <app-icon name="frame" size="sm"></app-icon>
          </button>
        </div>
      `;
    },
    shadow: false,
  },
});
