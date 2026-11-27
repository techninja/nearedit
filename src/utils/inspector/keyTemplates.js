/**
 * Template helpers that put a keyframe button beside an inspector field.
 * A row made here has a gutter of constant width on the right: the button
 * when the field can be animated, empty space when it cannot, so the
 * fields of a group stay aligned.
 * @module utils/inspector/keyTemplates
 */

import { html } from 'hybrids';
import { keyframeState } from '#utils/keyframes/state.js';
import { targetsOf } from './targets.js';

/** @typedef {import('hybrids').UpdateFunctionWithMethods<any>} Template */

/**
 * What a keyframe button needs to know about its surroundings.
 * @typedef {Object} KeyContext
 * @property {any[]} clips - The clips, as stored, the field applies to;
 *   none means no keyframes here (a track's effects)
 * @property {number} time - The playhead, timeline seconds
 * @property {number} fps
 * @property {boolean} locked
 */

/**
 * The key context of a field of the inspector model.
 * @param {import('./model.js').InspectorModel} model
 * @param {string} path - Decides which selected clips are meant
 * @returns {KeyContext}
 */
export function contextOf(model, path) {
  return {
    clips: targetsOf(model.refs || [], path).map((ref) => ref.clip),
    time: model.time,
    fps: model.fps,
    locked: Boolean(model.locked),
  };
}

/**
 * A keyframe button for one or more property paths.
 * @param {KeyContext} ctx
 * @param {string[]} paths
 * @param {string} label - What the paths animate, e.g. "Position"
 * @returns {Template}
 */
export function keyControl(ctx, paths, label) {
  const state = keyframeState(ctx.clips, paths, ctx.time, ctx.fps);
  return html`<keyframe-control
    data-path="${paths[0]}"
    paths="${paths}"
    label="${label}"
    state="${state.state}"
    previous="${state.hasPrevious}"
    next="${state.hasNext}"
    ease="${state.ease}"
    current="${state.current !== null}"
    disabled="${ctx.locked}"
  ></keyframe-control>`;
}

/**
 * A field with its keyframe gutter.
 * @param {KeyContext} ctx
 * @param {string[]} paths - Empty for a field that cannot be animated
 * @param {string} label
 * @param {Template} content - The field
 * @returns {Template}
 */
export function keyedRow(ctx, paths, label, content) {
  const keyable = paths.length > 0 && ctx.clips.length > 0;
  return html`<div class="keyed-row">
    ${content}${keyable ? keyControl(ctx, paths, label) : html`<span></span>`}
  </div>`;
}

/**
 * `keyedRow` for a field of the inspector model.
 * @param {import('./model.js').InspectorModel} model
 * @param {string[]} paths - Empty for a field that cannot be animated
 * @param {string} label
 * @param {Template} content
 * @returns {Template}
 */
export function keyed(model, paths, label, content) {
  return keyedRow(contextOf(model, paths[0] || 'label'), paths, label, content);
}
