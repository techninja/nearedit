/**
 * Building blocks of the step-kind table (stepKinds.js): the parameter
 * descriptions several kinds share. Isomorphic and pure.
 * @module utils/web/stepParams
 */

/** @typedef {import('./types.js').StepParam} StepParam */
/** @typedef {import('./types.js').StepKind} StepKind */

/**
 * What a step aims at. Required unless `extra` says otherwise.
 * @param {Partial<StepParam>} [extra]
 * @returns {StepParam}
 */
export function target(extra = {}) {
  return { type: 'target', default: '', label: 'Target', required: true, ...extra };
}

/**
 * @param {string} label
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @param {Partial<StepParam>} [extra]
 * @returns {StepParam}
 */
export function number(label, fallback, min, max, extra = {}) {
  return { type: 'number', default: fallback, label, min, max, ...extra };
}

/**
 * One of several words.
 * @param {string} label
 * @param {string[]} options
 * @param {string} [fallback] - The first option by default
 * @returns {StepParam}
 */
export function choice(label, options, fallback = options[0]) {
  return { type: 'select', default: fallback, label, options };
}

/**
 * @param {string} label
 * @param {Partial<StepParam>} [extra]
 * @returns {StepParam}
 */
export function text(label, extra = {}) {
  return { type: 'text', default: '', label, ...extra };
}

/** Which visible match of the target is meant, 0 = the first. */
export const index = number('Match number', 0, 0, 999, { integer: true });

/** The parameters of a step that only aims at something. */
export const aimed = { target: target(), index };

/**
 * One row of the table, frozen.
 * @param {string} name - The step's `do`
 * @param {string} label
 * @param {string} description
 * @param {[number, number]} timing - Default `duration` and `hold`, seconds
 * @param {Record<string, StepParam>} [params]
 * @param {Pick<StepKind, 'oneOf'|'camera'>} [rules] - What else the table
 *   knows about the kind
 * @returns {StepKind}
 */
export function kind(name, label, description, [duration, hold], params = {}, rules = {}) {
  const frozen = Object.fromEntries(
    Object.entries(params).map(([key, param]) => [key, Object.freeze({ ...param })]),
  );
  return Object.freeze({
    do: name,
    label,
    description,
    duration,
    hold,
    params: Object.freeze(frozen),
    ...rules,
  });
}
