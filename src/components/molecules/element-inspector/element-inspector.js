/**
 * Inspector group "Brand element" — for selected element clips: which
 * element of which kit they are, their blanks as fields (typing shows in
 * the preview at once; a visit to a field is one undo step; with several
 * clips the blanks they share are edited together), and how they stand
 * with the project's brand: out of date — with "Update to brand" for the
 * selection or for the whole timeline — or not in it. "Detach…" ends a
 * clip's tie to the brand after saying what that means.
 * @module components/molecules/element-inspector
 */

import { define, html } from 'hybrids';
import { colorDots } from '#utils/brandUi/createParts.js';
import * as on from '#utils/brandUi/inspectorEvents.js';
import { kitState } from '#utils/brandUi/kitState.js';
import { slotField, standing } from '#utils/brandUi/inspectorParts.js';
import { staleInfo } from '#utils/brandUi/stale.js';
import { getDoc } from '#utils/editor/session.js';
import { elementColors } from '#utils/timeline/clipMarksElement.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/brandUi/inspectorEvents.js').ElementInspectorHost} ElementInspectorHost */

/** @type {import('hybrids').Component<ElementInspectorHost>} */
export default define({
  tag: 'element-inspector',
  model: { value: /** @type {any} */ ({}) },
  kit: watch(kitState),
  render: {
    value: (host) => {
      const subject = on.subjectOf(host);
      if (!subject) return html``;
      const locked = subject.locked;
      const everywhere = staleInfo(getDoc(), host.kit.effective).outdated.length;
      return html`<div class="element-inspector">
        <div class="field-group-title">Brand element</div>
        <div class="field-row">
          <span class="field-label">Element</span>
          <span class="element-inspector-what" title="${`${subject.what} of ${subject.from}`}">
            <strong>${subject.what}</strong>
            <span class="element-inspector-kit">
              ${colorDots(elementColors(subject.refs[0].clip.element.design))} ${subject.from}
            </span>
          </span>
        </div>
        ${subject.fields.map((field) => slotField(field, locked))}
        ${subject.fields.length
          ? html``
          : html`<p class="element-inspector-none">
              ${subject.clipIds.length > 1
                ? 'These elements share no text to fill in.'
                : 'This element has no text to fill in.'}
            </p>`}
        ${standing(subject, everywhere)}
        <div class="element-inspector-actions">
          <button
            type="button"
            class="btn btn-ghost"
            data-action="detach"
            title="Turn into ordinary clips that no longer follow the brand"
            disabled="${locked}"
            onclick="${on.handleDetach}"
          >
            <app-icon name="unlink" size="sm"></app-icon> Detach from brand…
          </button>
        </div>
      </div>`;
    },
    shadow: false,
    observe: on.focusNewClip,
  },
});
