/**
 * What the director panel does with the events of its parts (the action
 * list, the form, the progress view, the history, the script review).
 * @module utils/directorUi/panelEvents
 */

import { undoRun } from '#utils/directorUi/apply.js';
import { openAction, setDirectorField } from '#utils/directorUi/controller.js';
import { cancelRun, runDirective } from '#utils/directorUi/run.js';
import { editScript, pickScript, scriptRun } from '#utils/directorUi/scripts.js';
import { setScriptMode, showScriptReview } from '#utils/directorUi/scripts.js';

/** Build the timeline from the script being reviewed. */
function buildFromScript() {
  const run = scriptRun();
  if (!run) return;
  showScriptReview(false);
  runDirective(run.action, run.form);
}

/** @type {Record<string, (detail: any) => void>} Event type → what it does */
const EVENTS = {
  actionpick: (detail) => openAction(detail.id),
  fieldchange: (detail) => setDirectorField(detail.key, detail.value),
  runcancel: () => cancelRun(),
  runundo: (detail) => undoRun(detail.id),
  scriptpick: (detail) => pickScript(detail.index),
  scriptedit: (detail) => editScript(detail.text),
  scriptmode: (detail) => setScriptMode(detail.mode),
  scriptclose: () => showScriptReview(false),
  scriptbuild: buildFromScript,
};

/** The event types the panel listens for. */
export const DIRECTOR_EVENTS = Object.keys(EVENTS);

/**
 * @param {CustomEvent} event - One of `DIRECTOR_EVENTS`
 */
export function handleDirectorEvent(event) {
  EVENTS[event.type]?.(event.detail || {});
}
