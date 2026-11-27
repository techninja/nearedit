/**
 * Commands for keyframes, effects and generators: keys at the playhead for
 * what the selected clips animate, stepping from key to key, bypassing
 * effects, pasting attributes, and adding the generator used last.
 * @module utils/commands/fx
 */

import { setAppState } from '#store/AppState.js';
import { GENERATORS } from '#utils/compose/catalog.js';
import { generatorItems } from '#utils/create/catalogView.js';
import { addGeneratorItem, effectTargets, lastGeneratorItem } from '#utils/create/panelActions.js';
import { pasteAttributes } from '#utils/edl/attributes.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getSelection } from '#utils/editor/view.js';
import { anyEnabled, applyEffectAction } from '#utils/inspector/effectActions.js';
import * as keys from '#utils/keyframes/clipKeys.js';
import { getPosition, seek } from '#utils/playback/transport.js';
import { getClipboard } from './clipboard.js';

/** @returns {boolean} True when a selected clip animates something */
export const selectionIsAnimated = () => keys.animatedClips(getDoc(), getSelection()).length > 0;

/** @returns {boolean} True when the selection has a key at the playhead */
export const hasKeyAtPlayhead = () => keys.hasKeysAt(getDoc(), getSelection(), getPosition());

/** Key every animated property of the selected clips at the playhead. */
export function addKeyframeAtPlayhead() {
  const time = getPosition();
  return edit((doc) => keys.addKeysAt(doc, getSelection(), time));
}

/** Remove the keys the selected clips have at the playhead. */
export function removeKeyframeAtPlayhead() {
  const time = getPosition();
  return edit((doc) => keys.removeKeysAt(doc, getSelection(), time));
}

/** Remove every keyframe of the selected clips. */
export function clearKeyframes() {
  return edit((doc) => keys.clearAllKeys(doc, getSelection()));
}

/**
 * @param {1|-1} direction
 * @returns {number|null} Time of the selection's next / previous key
 */
export const keyframeFrom = (direction) =>
  keys.stepKeyTime(getDoc(), getSelection(), getPosition(), direction);

/** @param {1|-1} direction */
export function goToKeyframe(direction) {
  const time = keyframeFrom(direction);
  if (time !== null) seek(time);
}

/** @returns {string[]} The selected clips that can carry effects */
const effectClips = () => effectTargets().map((target) => target.clipId);

/** @returns {boolean} True when a selected clip has effects */
export const selectionHasEffects = () =>
  getDoc().tracks.some((track) =>
    track.clips.some((clip) => getSelection().includes(clip.clipId) && clip.effects?.length > 0),
  );

/** @returns {boolean} True when effects of the selection are switched on */
export const effectsAreOn = () => anyEnabled(getDoc(), { clipIds: effectClips() });

/** Switch the effects of the selected clips off, or back on. */
export function bypassEffects() {
  return edit((doc) => applyEffectAction(doc, { clipIds: effectClips() }, { action: 'bypass' }));
}

/** Show the effect stack of the selection: the inspector, scrolled to it. */
export function showEffects() {
  setAppState({ dockTab: 'inspector', sheetOpen: true });
  // Two frames: one for the tab to show, one for the inspector to lay out.
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      document.querySelector('inspector-effects')?.scrollIntoView({ block: 'start' }),
    ),
  );
}

/** @returns {boolean} True when clips were copied and something is selected to paste onto */
export const canPasteAttributes = () => !!getClipboard() && getSelection().length > 0;

/** Paste how the copied clip looks — transform, effects, keyframes, fades — onto the selection. */
export function pasteClipAttributes() {
  const copied = getClipboard();
  return copied ? edit((doc) => pasteAttributes(doc, copied, getSelection())) : false;
}

/** Add the generator that was added last (the first of the catalog until then). */
export function addLastGenerator() {
  const item = lastGeneratorItem() || generatorItems(GENERATORS)[0];
  if (item) addGeneratorItem(item);
}
