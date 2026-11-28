/**
 * Command catalog — the person cutout: switch it on or off for the selected
 * clips, and make every cutout the timeline still waits for. Joins the
 * Edit group of the registry, so the shortcuts list, the keyboard and the
 * menus find them like any other command.
 * @module utils/cutoutUi/commands
 */

import { setAppState } from '#store/AppState.js';
import { hasCutout } from '#utils/cutout/index.js';
import { commandsFor } from '#utils/commands/catalogKit.js';
import { setCutout } from '#utils/edl/index.js';
import { findClip } from '#utils/edl/query.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import { clipsWaiting, isSubject } from './clipStatus.js';
import { makeWaiting } from './runtime.js';

/** @typedef {import('#utils/commands/registry.js').Command} Command */

/**
 * @returns {any[]} The selected clips a person can be cut out of, on unlocked tracks
 */
export function selectedSubjects() {
  const doc = getDoc();
  return getSelection()
    .map((clipId) => findClip(doc, clipId))
    .filter((found) => found && !found.track.locked && isSubject(found.clip, found.track))
    .map((found) => found.clip);
}

/** @returns {boolean} True when a clip that can be cut out is selected */
export const hasSubject = () => selectedSubjects().length > 0;

/** @returns {boolean} True when every selected clip that can be is cut out */
export function selectionIsCutOut() {
  const clips = selectedSubjects();
  return clips.length > 0 && clips.every((clip) => hasCutout(clip));
}

/** Show the inspector's "Cut out person" group: its settings and the progress. */
function showCutout() {
  setAppState({ dockTab: 'inspector', sheetOpen: true });
  // Two frames: one for the tab to show, one for the inspector to lay out.
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      document.querySelector('cutout-inspector')?.scrollIntoView({ block: 'nearest' }),
    ),
  );
}

/**
 * Cut the person out of the selected clips — or, when all of them already
 * are, switch it off again. One undo step.
 * @returns {boolean} false when nothing changed
 */
export function toggleCutout() {
  const ids = selectedSubjects().map((clip) => clip.clipId);
  const on = !selectionIsCutOut();
  if (on) showCutout();
  return edit((doc) => setCutout(doc, ids, { on }));
}

/** @returns {boolean} True when a clip with cutout on has no (whole) cutout yet */
export const hasWaitingCutouts = () => clipsWaiting(getDoc()).length > 0;

const change = commandsFor('Edit');

/** @type {Command[]} */
export const CUTOUT_COMMANDS = [
  change('cutout.toggle', 'Cut out person', ['Alt+P'], toggleCutout, {
    enabled: hasSubject,
    pressed: selectionIsCutOut,
    icon: 'person',
  }),
  change('cutout.makeAll', 'Make all missing cutouts', [], () => void makeWaiting(), {
    enabled: hasWaitingCutouts,
  }),
];
