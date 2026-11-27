/**
 * Context menus of the timeline, generated from the command registry: what
 * a right-click (or long-press) offers on a clip, on an empty lane, on the
 * ruler and on a marker.
 * @module utils/timeline/menuModel
 */

import { deleteMarker } from '#utils/commands/insert.js';
import { getCommand, isEnabled, isPressed, runCommand } from '#utils/commands/registry.js';
import { getView } from '#utils/editor/view.js';
import { shortcutLabel } from '#utils/keyboard/index.js';
import { setLoopRange } from '#utils/playback/transport.js';

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

const CLIP_MENU = [
  'edit.split',
  '-',
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.duplicate',
  '-',
  'edit.delete',
  'edit.rippleDelete',
  '-',
  'edit.trimStart',
  'edit.trimEnd',
  '-',
  'clip.group',
  'clip.ungroup',
  'clip.link',
  'clip.unlink',
];

const LANE_MENU = [
  'edit.paste',
  'edit.split',
  '-',
  'marker.add',
  'title.add',
  '-',
  'select.all',
  'select.none',
  '-',
  'track.addVideo',
  'track.addAudio',
  '-',
  'view.zoomFit',
];

const RULER_MENU = [
  'marker.add',
  'transport.toggleLoop',
  'loop.clear',
  '-',
  'view.zoomIn',
  'view.zoomOut',
  'view.zoomFit',
];

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
 * The context menu for what was right-clicked.
 * @param {import('./hitTest.js').Hit} hit
 * @param {{ renameMarker: (markerId: string) => void }} ui
 * @returns {MenuItem[]}
 */
export function contextMenu(hit, ui) {
  if (hit.zone === 'ruler') {
    const { loopStart, loopEnd } = getView();
    const clearLoop = {
      label: 'Clear loop region',
      disabled: !(loopEnd > loopStart),
      run: () => setLoopRange(0, 0),
    };
    const ruler = build(RULER_MENU, { 'loop.clear': clearLoop });
    if (!hit.markerId) return ruler;
    const { markerId } = hit;
    return [
      { label: 'Rename marker', run: () => ui.renameMarker(markerId) },
      { label: 'Delete marker', run: () => deleteMarker(markerId) },
      LINE,
      ...ruler,
    ];
  }
  return build(hit.clipId && !hit.locked ? CLIP_MENU : LANE_MENU);
}
