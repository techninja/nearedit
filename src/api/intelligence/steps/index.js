/**
 * Step registry. Steps run in this order: the FFmpeg-only ones first (cheap,
 * and their results feed the model-backed ones — scene starts pick the
 * frames to tag, silences pick where long audio is split for upload).
 * @module api/intelligence/steps
 */

import { probeStep } from './probe.js';
import { silenceStep } from './silence.js';
import { scenesStep } from './scenes.js';
import { beatsStep } from './beats.js';
import { transcribeStep } from './transcribe.js';
import { tagsStep } from './tags.js';

/** @type {import('./types.js').Step[]} */
export const STEPS = [probeStep, silenceStep, scenesStep, beatsStep, transcribeStep, tagsStep];

export const STEP_NAMES = STEPS.map((step) => step.name);

/**
 * @param {string} name
 * @returns {import('./types.js').Step|undefined}
 */
export function getStep(name) {
  return STEPS.find((step) => step.name === name);
}

/**
 * De-duplicate step names and put them in execution order.
 * @param {string[]} names
 * @returns {import('./types.js').Step[]}
 */
export function orderSteps(names) {
  return STEPS.filter((step) => names.includes(step.name));
}
