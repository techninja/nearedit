/**
 * Context menus of the timeline, generated from the command registry: what
 * a right-click (or long-press) offers on a clip (and on its fades), on an
 * empty lane, on the ruler, on a marker and on a region.
 * @module utils/timeline/menuModel
 */

import { deleteMarker } from '#utils/commands/insert.js';
import { deleteRegion, selectRegion } from '#utils/commands/marks.js';
import { getCommand, isEnabled, isPressed, runCommand } from '#utils/commands/registry.js';
import { clearTimeSelection, hasTimeSelection } from '#utils/commands/timeSelection.js';
import { removeKeyframesAt } from '#utils/edl/keyframes.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { shortcutLabel } from '#utils/keyboard/index.js';
import { fadeMenu } from './menuFades.js';
import { CLIP_MENU, LANE_MENU, RULER_MENU } from './menuLists.js';
import { webMenu } from './menuWeb.js';

/**
 * @typedef {Object} MenuItem
 * @property {string} [label]
 * @property {string} [shortcut] - Shown at the right edge
 * @property {boolean} [disabled]
 * @property {boolean} [checked] - A toggle that is on
 * @property {boolean} [separator] - A dividing line; other fields unused
 * @property {() => void} [run]
 */

/** @type {MenuItem} */
const LINE = { separator: true };

/**
 * A menu item for a registered command.
 * @param {string} id
 * @returns {MenuItem}
 */
export function commandItem(id) {
  const command = getCommand(id);
  return {
    label: command.label,
    shortcut: shortcutLabel(id),
    disabled: !isEnabled(id),
    checked: isPressed(id),
    run: () => runCommand(id),
  };
}

/**
 * @param {string[]} ids - Command ids; `-` is a separator
 * @param {Record<string, MenuItem>} [extra] - Items that are not registry commands
 * @returns {MenuItem[]}
 */
function build(ids, extra = {}) {
  return ids.map((id) => (id === '-' ? LINE : extra[id] || commandItem(id)));
}

/**
 * On a keyframe mark of a clip: delete every key the clip has there.
 * @param {import('./hitTest.js').Hit} hit
 * @returns {MenuItem[]}
 */
function keyframeMenu({ part, clipId, keyTime }) {
  if (part !== 'keyframe') return [];
  const run = () => edit((doc) => removeKeyframesAt(doc, clipId, keyTime));
  return [{ label: 'Delete keyframe', run }, LINE];
}

/**
 * The context menu for what was right-clicked.
 * @param {import('./hitTest.js').Hit} hit
 * @param {{ renameMarker: (markerId: string) => void,
 *   renameRegion: (regionId: string) => void }} ui
 * @returns {MenuItem[]}
 */
export function contextMenu(hit, ui) {
  if (hit.zone !== 'ruler') {
    const onClip = hit.clipId && !hit.locked;
    // On a web clip, a keyframe mark or a fade, what was pointed at comes first.
    const doc = getDoc();
    const pointed = onClip
      ? [...webMenu(doc, hit), ...keyframeMenu(hit), ...fadeMenu(doc, hit)]
      : [];
    return [...pointed, ...build(onClip ? CLIP_MENU : LANE_MENU)];
  }
  const clear = {
    label: 'Clear loop region',
    disabled: !hasTimeSelection(),
    run: clearTimeSelection,
  };
  const ruler = build(RULER_MENU, { 'loop.clear': clear });
  const { markerId, regionId } = hit;
  if (markerId) {
    return [
      { label: 'Rename marker', run: () => ui.renameMarker(markerId) },
      { label: 'Delete marker', run: () => deleteMarker(markerId) },
      LINE,
      ...ruler,
    ];
  }
  if (!regionId) return ruler;
  return [
    { label: 'Select region', run: () => selectRegion(regionId) },
    { label: 'Rename region', run: () => ui.renameRegion(regionId) },
    { label: 'Delete region', run: () => deleteRegion(regionId) },
    LINE,
    ...ruler,
  ];
}
