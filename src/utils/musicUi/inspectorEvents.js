/**
 * Behaviour of the inspector's "Music" group (`<music-inspector>`): its
 * fields change the song of the selected clip (one undo step per
 * interaction), its buttons open the music editor, save the song as MIDI
 * and try a failed rendering again.
 * @module utils/musicUi/inspectorEvents
 */

import { isMusicClip } from '#utils/music/clip.js';
import { openMusicEditor } from './editorState.js';
import { changeSong } from './edits.js';
import { setField } from './fieldRoutes.js';
import { exportMidi } from './midiFiles.js';
import { retryRendering } from './rendering.js';

/**
 * @typedef {Object} MusicInspectorHost
 * @property {import('#utils/inspector/model.js').InspectorModel} model
 * @property {{ byClip: Record<string, import('./renderState.js').RenderStatus> }} renders
 */

/** @typedef {MusicInspectorHost & HTMLElement} Host */

/**
 * @param {{ model: MusicInspectorHost['model'] }} host
 * @returns {{ clip: any, track: any }|null} The music clip the group is
 *   about: the one selected clip, when it is a music clip
 */
export function subjectOf({ model }) {
  const refs = model.refs || [];
  return refs.length === 1 && isMusicClip(refs[0].clip) ? refs[0] : null;
}

/** @type {(host: Host) => string} */
const clipIdOf = (host) => subjectOf(host)?.clip.clipId || '';

/** A field of the group changed: it is a field of the song. @param {Host} host @param {CustomEvent} event */
export function handleField(host, event) {
  const { name, value, phase } = event.detail;
  // The inspector's own listener would take the name for a path of the clip.
  event.stopPropagation();
  const element = /** @type {Element} */ (event.target);
  changeSong(clipIdOf(host), name, (song) => setField(song, name, value), phase, element);
}

/** A part's mute button. @param {Host} host @param {Event} event */
export function handleMute(host, event) {
  const { part, muted } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
  const name = `part.${part}.mute`;
  changeSong(clipIdOf(host), name, (song) => setField(song, name, muted !== 'true'));
}

/** @param {Host} host */
export function handleEdit(host) {
  openMusicEditor(clipIdOf(host));
}

/** @param {Host} host */
export function handleExport(host) {
  const subject = subjectOf(host);
  if (subject) exportMidi(subject.clip);
}

/** @param {Host} host */
export function handleRetry(host) {
  retryRendering(clipIdOf(host));
}
