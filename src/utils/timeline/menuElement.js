/**
 * The brand element part of a clip's context menu: right-click an element
 * clip to bring it — or every out-of-date element — up to date with the
 * project's brand, to detach it, or to open the Brand dialog.
 * @module utils/timeline/menuElement
 */

import { isElementClip } from '#utils/brand/clip.js';
import { openBrandDialog } from '#utils/brandUi/dialogState.js';
import { detachElements } from '#utils/brandUi/slotEdits.js';
import { staleInfo, updateToBrand } from '#utils/brandUi/stale.js';
import { DETACH_WARNING } from '#utils/brandUi/inspectorEvents.js';
import { findClip } from '#utils/edl/query.js';
import { shortcutLabel } from '#utils/keyboard/index.js';
import { confirmAction } from '#utils/ui/confirm.js';

/**
 * Ask, then detach one clip from the brand.
 * @param {string} clipId
 */
async function detach(clipId) {
  const sure = await confirmAction({
    title: 'Detach from the brand?',
    message: DETACH_WARNING,
    confirmLabel: 'Detach',
    cancelLabel: 'Keep as it is',
  });
  if (sure) await detachElements([clipId]);
}

/**
 * Menu items for an element clip under a point.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @param {{ clipId?: string }} hit
 * @returns {import('./menuModel.js').MenuItem[]} Empty when the clip is not an element clip
 */
export function elementMenu(doc, { clipId }) {
  if (!isElementClip(findClip(doc, clipId)?.clip)) return [];
  const stale = staleInfo(doc);
  const all = stale.outdated.length;
  return [
    {
      label: 'Update to brand',
      disabled: !stale.outdated.includes(clipId),
      run: () => void updateToBrand([clipId]),
    },
    ...(all > 1
      ? [{ label: `Update all ${all} elements to brand`, run: () => void updateToBrand() }]
      : []),
    { label: 'Detach from brand…', run: () => void detach(clipId) },
    { label: 'Brand…', shortcut: shortcutLabel('brand.open'), run: () => openBrandDialog() },
    { separator: true },
  ];
}
