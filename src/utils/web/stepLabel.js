/**
 * A step in a few words, for timeline ticks, lists and messages. What is
 * shown comes from the step-kind table, not from knowledge of any kind.
 * Isomorphic and pure.
 * @module utils/web/stepLabel
 */

import { stepKind } from './stepKinds.js';
import { describeTarget } from './target.js';

/** @typedef {import('./types.js').Step} Step */
/** @typedef {import('./types.js').StepKind} StepKind */

/** Longest summary of a step's parameters, characters. */
const MAX_SUMMARY = 48;

/**
 * @param {string} text
 * @returns {string} One line, cut with an ellipsis when it is long
 */
function brief(text) {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > MAX_SUMMARY ? `${line.slice(0, MAX_SUMMARY - 1)}…` : line;
}

/**
 * The parameter that says most about a step: the first in table order that
 * is a target, a key, or a required text, and is set; failing those, the
 * first number that is not at its default.
 * @param {Step} step
 * @param {StepKind} kind
 * @returns {string} '' when the step has nothing to say
 */
function summary(step, kind) {
  const params = Object.entries(kind.params);
  for (const [name, spec] of params) {
    const value = step[name];
    if (spec.type === 'target' && value !== '' && value !== undefined) {
      return typeof value === 'number' ? `${value} px` : describeTarget(value) || String(value);
    }
    if (spec.type === 'key' && value) {
      const held = params.find(([, other]) => other.multiple)?.[0];
      return [...(Array.isArray(step[held]) ? step[held] : []), value].join('+');
    }
    if (spec.type === 'text' && spec.required && value) return `“${brief(String(value))}”`;
  }
  for (const [name, spec] of params) {
    if (spec.type === 'number' && !spec.integer && Number.isFinite(step[name])) {
      if (step[name] !== spec.default) return `${spec.label.toLowerCase()} ${step[name]}`;
    }
  }
  return '';
}

/**
 * @param {Step} step - A normalised step
 * @returns {string} Its note when it has one, otherwise what it does:
 *   `Click: text=Get started`, `Type: “hello”`, `Wait`
 */
export function stepLabel(step) {
  if (typeof step?.note === 'string' && step.note.trim()) return step.note.trim();
  const kind = stepKind(step?.do);
  if (!kind) return '';
  const what = summary(step, kind);
  return what ? `${kind.label}: ${brief(what)}` : kind.label;
}
