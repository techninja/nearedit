/**
 * The adaptation form — its starting values, validation and the requests
 * it turns into. Pure.
 * @module utils/projects/adaptationForm
 */

import { presetFor } from '#utils/projects/adaptationPresets.js';

/**
 * @typedef {Object} AdaptationFormValues
 * @property {string} name
 * @property {string} aspectRatio
 * @property {string} resolution
 * @property {number} fps
 * @property {string} parentId - '' for a top-level adaptation
 * @property {boolean} copy - Start from a copy of the parent's timeline
 */

/**
 * Starting values of the form.
 * @param {{ parent?: import('#utils/projects/api.js').Adaptation|null,
 *   editing?: import('#utils/projects/api.js').Adaptation|null }} [context]
 * @returns {AdaptationFormValues}
 */
export function initialAdaptationForm(context = {}) {
  const { parent = null, editing = null } = context;
  if (editing) {
    const { name, aspectRatio, resolution, fps } = editing;
    return {
      name,
      aspectRatio,
      resolution,
      fps,
      parentId: editing.parentAdaptationId,
      copy: false,
    };
  }
  // A variant of a landscape edit is most often the vertical cut of it.
  const aspectRatio = parent ? (parent.aspectRatio === '9:16' ? '1:1' : '9:16') : '16:9';
  return {
    name: parent ? `${parent.name} — ${presetFor(aspectRatio).label}` : '',
    aspectRatio,
    resolution: presetFor(aspectRatio).sizes[0],
    fps: parent?.fps || 30,
    parentId: parent?.id || '',
    copy: Boolean(parent),
  };
}

/**
 * Values after choosing another aspect ratio: the size follows the ratio.
 * @param {AdaptationFormValues} values
 * @param {string} aspectRatio
 * @returns {AdaptationFormValues}
 */
export function withAspect(values, aspectRatio) {
  const preset = presetFor(aspectRatio);
  if (!preset) return values;
  return { ...values, aspectRatio, resolution: preset.sizes[0] };
}

/**
 * @param {AdaptationFormValues} values
 * @returns {Record<string, string>} Field → problem; empty when the form is fine
 */
export function validateAdaptationForm(values) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!values.name.trim()) errors.name = 'Give the adaptation a name';
  else if (values.name.trim().length > 200) errors.name = 'At most 200 characters';
  if (!(values.fps >= 1 && values.fps <= 240)) errors.fps = 'Between 1 and 240 frames per second';
  return errors;
}

/**
 * Body of `POST /projects/:id/adaptations`.
 * @param {AdaptationFormValues} values
 * @returns {Record<string, string|number>}
 */
export function createRequest(values) {
  const { aspectRatio, resolution, parentId } = values;
  const body = { name: values.name.trim(), aspectRatio, resolution, fps: Number(values.fps) };
  if (!parentId) return body;
  return { ...body, parentAdaptationId: parentId, ...(values.copy && { copyFrom: parentId }) };
}

/**
 * Body of `PUT /projects/:id/adaptations/:aid`.
 * @param {AdaptationFormValues} values
 * @returns {Record<string, string|number>}
 */
export function updateRequest(values) {
  const { aspectRatio, resolution } = values;
  return { name: values.name.trim(), aspectRatio, resolution, fps: Number(values.fps) };
}
