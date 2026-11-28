/**
 * Brand dialog — where a project's look is chosen and shaped. One view
 * lists the kits there are, built-in and of the library, each by its
 * colours and a live picture of its lower third: pressing one makes it the
 * project's brand. The other customises the kit in use — a token editor
 * beside a live preview of several elements — and saves the result as the
 * project's own kit or as a kit of the library. Whenever the brand has
 * changed it says how many element clips on the timeline are out of date
 * and offers to update them; it never restyles by itself. Opened by
 * `openBrandDialog()` (`#utils/brandUi/dialogState.js`). While it is
 * mounted the project's kit is kept loaded for the whole editor.
 * @module components/organisms/brand-dialog
 */

import { define, html, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import * as on from '#utils/brandUi/dialogEvents.js';
import { dialogFooter } from '#utils/brandUi/dialogFooter.js';
import { chooseBody, customiseBody } from '#utils/brandUi/dialogParts.js';
import { brandDialog } from '#utils/brandUi/dialogState.js';
import { draftState } from '#utils/brandUi/draftState.js';
import { kitState, watchProjectKit } from '#utils/brandUi/kitState.js';
import { liveDoc } from '#utils/editor/liveDoc.js';
import { dialogFrame } from '#utils/ui/dialogFrame.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-dialog/index.js';
import '#atoms/app-icon/index.js';
import '#molecules/brand-kit-list/index.js';
import '#molecules/brand-preview/index.js';
import '#molecules/brand-token-editor/index.js';

/** @typedef {import('#utils/brandUi/dialogEvents.js').BrandDialogHost} BrandDialogHost */

/** @param {BrandDialogHost} host */
function dialog(host) {
  const customising = host.state.view === 'customise' && host.draft.draft;
  return html`<app-dialog open onclose="${on.handleClose}">
    ${dialogFrame({
      title: customising ? `Brand — customise ${host.draft.base.name}` : 'Brand',
      body: customising ? customiseBody(host) : chooseBody(host),
      footer: dialogFooter(host),
      size: 'huge',
      onClose: on.handleClose,
    })}
  </app-dialog>`;
}

/** @type {import('hybrids').Component<BrandDialogHost>} */
export default define({
  tag: 'brand-dialog',
  state: watch(brandDialog),
  kit: watch(kitState),
  draft: watch(draftState),
  doc: liveDoc(),
  timeline: store(TimelineState),
  naming: false,
  libraryName: '',
  // While the editor page is up: the project's kit follows the open project.
  services: { value: true, connect: () => watchProjectKit() },
  opened: { value: ({ state }) => state.open, observe: on.handleOpened },
  render: {
    value: (host) => (host.state.open ? dialog(host) : html``),
    shadow: false,
    observe: on.keepFocus,
  },
});
