/**
 * Captions from the transcript panel: whether the words on screen are shown
 * as captions on the timeline, and the toolbar's switch for it. The panel
 * reads a file through the clips of one track that play it (its chain);
 * the switch is for those clips.
 * @module utils/transcript/panelCaptions
 */

import { switchCaptions } from '#utils/captionsUi/actions.js';
import { captionSubject } from '#utils/captionsUi/clipSubject.js';
import { getDoc } from '#utils/editor/session.js';
import { panelContext } from './panelContext.js';

/** @typedef {import('./panelContext.js').Host} Host */

/**
 * Where the captions of a chain stand.
 * @param {any} doc
 * @param {import('./usage.js').Chain} chain
 * @returns {{ ids: string[], state: ''|'on'|'off' }} `''`: the file is not
 *   on the timeline, or its track is locked — there is nothing to switch
 */
export function chainCaptions(doc, chain) {
  if (!chain.segments.length || chain.locked) return { ids: [], state: '' };
  const subject = captionSubject(
    doc,
    chain.segments.map((segment) => segment.clipId),
  );
  if (!subject.voices.length) return { ids: [], state: '' };
  const all = subject.on === subject.voices.length;
  return { ids: subject.ids, state: all ? 'on' : 'off' };
}

/**
 * The toolbar's "CC": captions on for the clips that play the file, or off
 * when all of them have them. One undo step.
 * @param {Host} host
 */
export function toggleCaptions(host) {
  const { ids, state } = chainCaptions(getDoc(), panelContext(host).chain);
  if (!ids.length) return;
  switchCaptions(ids, state !== 'on');
  host.message = state === 'on' ? 'Captions off for this clip' : 'Captions on for this clip';
}
