/**
 * The inspector's three views as template functions: the selected clips,
 * the focused track, and the document. Kept apart from the organism so it
 * only has to choose between them.
 * @module utils/inspector/inspectorParts
 */

import { html } from 'hybrids';
import { heldEffects } from './effectClipboard.js';
import { imageChoices } from './imageChoices.js';
import { shownClip } from './model.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */
/** @typedef {import('./model.js').InspectorModel} InspectorModel */

/** Keyframe strips shown at once (a linked pair: picture and sound). */
const MAX_STRIPS = 2;

/**
 * The header above a view.
 * @param {string} heading
 * @param {string} detail
 * @param {string} [warning]
 * @returns {Template}
 */
function header(heading, detail, warning = '') {
  return html`<header class="clip-inspector-header">
    <div class="clip-inspector-heading" title="${heading}">${heading}</div>
    <div class="clip-inspector-detail">${detail}</div>
    ${warning
      ? html`<div class="clip-inspector-locked">
          <app-icon name="lock" size="sm"></app-icon> ${warning}
        </div>`
      : html``}
  </header>`;
}

/**
 * The effect stack of the selection: of the one clip that draws, or — with
 * several — just the buttons that apply to all of them.
 * @param {InspectorModel} model
 * @returns {Template}
 */
function clipEffects(model) {
  if (!model.visual.length) return html``;
  const single = model.visual.length === 1;
  const [{ clip }] = model.visual;
  const context = {
    clips: single ? [clip] : [],
    time: model.time,
    fps: model.fps,
    locked: model.locked,
    images: imageChoices(),
  };
  return html`<inspector-effects
    effects="${single ? clip.effects : []}"
    shown="${single ? shownClip(clip, model.time).effects : []}"
    context="${context}"
    owner="${single ? 'clip' : 'clips'}"
    pasteable="${Boolean(heldEffects())}"
  ></inspector-effects>`;
}

/**
 * The view of the selected clips.
 * @param {InspectorModel} model
 * @returns {Template}
 */
export function clipsView(model) {
  const animated = model.refs.filter((ref) => Object.keys(ref.clip.keyframes || {}).length);
  return html`
    ${header(
      model.heading,
      model.detail,
      model.locked ? 'On a locked track — unlock it to edit' : '',
    )}
    <div class="panel-body">
      <inspector-clip model="${model}"></inspector-clip>
      <inspector-timing model="${model}"></inspector-timing>
      <inspector-generator model="${model}"></inspector-generator>
      <inspector-text model="${model}"></inspector-text>
      <inspector-text-style model="${model}"></inspector-text-style>
      <inspector-text-motion model="${model}"></inspector-text-motion>
      <inspector-transform model="${model}"></inspector-transform>
      <inspector-crop model="${model}"></inspector-crop>
      <inspector-motion model="${model}"></inspector-motion>
      ${clipEffects(model)}
    </div>
    ${animated
      .slice(0, MAX_STRIPS)
      .map((ref) =>
        html`<keyframe-strip
          class="clip-inspector-strip"
          clip="${ref.clip}"
          time="${model.time}"
          fps="${model.fps}"
          locked="${Boolean(ref.track.locked)}"
        ></keyframe-strip>`.key(ref.clip.clipId),
      )}
  `;
}

/**
 * The view of a track: its settings, its effect stack, then the document.
 * @param {import('./trackSubject.js').TrackModel} track
 * @param {Template} documentView
 * @returns {Template}
 */
export function trackView(track, documentView) {
  const context = { clips: [], time: 0, fps: track.fps, locked: false, images: imageChoices() };
  return html`
    ${header(track.heading, track.detail)}
    <div class="panel-body">
      <inspector-track track="${track}"></inspector-track>
      ${track.type === 'video'
        ? html`<inspector-effects
            effects="${track.track.effects}"
            shown="${track.track.effects}"
            context="${context}"
            owner="track"
            pasteable="${Boolean(heldEffects())}"
          ></inspector-effects>`
        : html``}
      ${documentView}
    </div>
  `;
}
