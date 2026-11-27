/**
 * What the inspector does with the events its groups send up: a
 * `field-change` edits the selected clips (or the focused track), a
 * `keyframe-action` adds, removes or eases keys or moves the playhead to
 * one, an `effect-action` changes an effect stack. Every edit goes through
 * the edit session; live changes of one field are one undo step.
 * @module utils/inspector/inspectorEvents
 */

import { findClip } from '#utils/edl/query.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getSelection, getView } from '#utils/editor/view.js';
import { easeKeys, stopAnimation, toggleKey } from '#utils/keyframes/actions.js';
import { keyframeState, stepTime } from '#utils/keyframes/state.js';
import { sourceDurations } from '#utils/media/library.js';
import { getPosition, seek } from '#utils/playback/transport.js';
import { applyChange } from './apply.js';
import { applyEffectAction } from './effectActions.js';
import { copyEffects, heldEffects, holdEffects, pasteEffects } from './effectClipboard.js';
import { cancelEdit, commitEdit, finishEdit, liveEdit } from './gesture.js';
import { isVisual, selectedClips, targetsOf } from './targets.js';
import { applyTrackChange } from './trackSubject.js';

/** @typedef {(doc: any) => any} Operation */

/**
 * What the inspector is showing: the selected clips, else the focused
 * track, else the document.
 * @returns {{ kind: 'clips'|'track'|'document', refs: import('./targets.js').SelectedClip[],
 *   trackId: string }}
 */
export function subject() {
  const doc = getDoc();
  const refs = selectedClips(doc, getSelection());
  if (refs.length) return { kind: 'clips', refs, trackId: '' };
  const trackId = getView().activeTrackId || '';
  const found = doc.tracks.some((track) => track.trackId === trackId);
  return { kind: found ? 'track' : 'document', refs, trackId: found ? trackId : '' };
}

/**
 * A field reported a change. Live changes (typing, stepping, scrubbing,
 * dragging a slider) are previewed inside one gesture and recorded as a
 * single undo step when the interaction ends.
 * @param {HTMLElement} _host
 * @param {CustomEvent<import('./fieldEvents.js').FieldChangeDetail>} event
 */
export function handleFieldChange(_host, event) {
  const { name, value, phase } = event.detail;
  event.stopPropagation();
  if (phase === 'cancel') return cancelEdit();
  const { kind, trackId } = subject();
  if (kind === 'document') return;
  const selection = getSelection();
  const opts = {
    sourceDurations: sourceDurations(),
    autoCrossfade: getView().autoCrossfade,
    time: getPosition(),
  };
  /** @type {Operation} */
  const operation =
    kind === 'track'
      ? (doc) => applyTrackChange(doc, trackId, { name, value })
      : (doc) => applyChange(doc, selection, { name, value }, opts);
  if (phase === 'live') liveEdit(name, operation, /** @type {Element} */ (event.target));
  else commitEdit(name, operation);
}

/**
 * A keyframe button was pressed.
 * @param {HTMLElement} _host
 * @param {CustomEvent<import('#utils/keyframes/controlEvents.js').KeyframeActionDetail>} event
 */
export function handleKeyframeAction(_host, event) {
  const { paths, action, ease } = event.detail;
  event.stopPropagation();
  const refs = targetsOf(subject().refs, paths[0] || '');
  const ids = refs.map((ref) => ref.clip.clipId);
  const clips = refs.map((ref) => ref.clip);
  const time = getPosition();
  const fps = getDoc().fps || 30;
  if (!ids.length) return;
  finishEdit();
  if (action === 'previous' || action === 'next') {
    const at = stepTime(clips, paths, time, action === 'next' ? 1 : -1, fps);
    if (at !== null) seek(at);
  } else if (action === 'toggle') edit((doc) => toggleKey(doc, ids, paths, time));
  else if (action === 'stop') edit((doc) => stopAnimation(doc, ids, paths, time));
  else if (action === 'ease') {
    const { current } = keyframeState(clips, paths, time, fps);
    if (current !== null) edit((doc) => easeKeys(doc, ids, paths, current, ease));
  }
}

/**
 * The stack an effect action goes to. Adding, pasting and bypassing go to
 * every selected clip that draws; an action on one effect to the clip
 * that has it.
 * @param {string} [effectId]
 * @returns {import('./effectActions.js').StackTarget|null}
 */
function stackTarget(effectId) {
  const { kind, refs, trackId } = subject();
  if (kind === 'track') return { trackId };
  const visual = refs.filter((ref) => isVisual(ref) && !ref.track.locked);
  const owners = effectId
    ? visual.filter((ref) => ref.clip.effects.some((fx) => fx.effectId === effectId)).slice(0, 1)
    : visual;
  return owners.length ? { clipIds: owners.map((ref) => ref.clip.clipId) } : null;
}

/**
 * An effect-stack button was pressed, or an effect was picked to add.
 * @param {{ copied: number } & HTMLElement} host - `copied` counts copies,
 *   so the paste button wakes up
 * @param {CustomEvent<import('./effectActions.js').EffectAction>} event
 */
export function handleEffectAction(host, event) {
  const { action, effectId } = event.detail;
  event.stopPropagation();
  const target = stackTarget(effectId);
  if (!target) return;
  finishEdit();
  if (/** @type {string} */ (action) === 'copy') {
    const from = 'trackId' in target ? target : { clipId: target.clipIds[0] };
    if (holdEffects(copyEffects(getDoc(), from))) host.copied += 1;
  } else if (/** @type {string} */ (action) === 'paste') {
    edit((doc) => pasteEffects(doc, heldEffects(), target));
  } else edit((doc) => applyEffectAction(doc, target, event.detail));
}

/**
 * Whether the inspector's values depend on where the playhead is: true
 * when a selected clip has keyframes.
 * @returns {boolean}
 */
export function followsPlayhead() {
  const doc = getDoc();
  return getSelection().some(
    (clipId) => Object.keys(findClip(doc, clipId)?.clip.keyframes || {}).length > 0,
  );
}
