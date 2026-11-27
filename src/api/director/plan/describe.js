/**
 * A resolved plan as plain JSON, for `DirectorResult.plan` — what the
 * director decided to use, in a form a person can read.
 * @module api/director/plan/describe
 */

import { round3 } from '#utils/director/snap.js';

/**
 * @typedef {import('./parts.js').ResolvedPart} ResolvedPart
 * @typedef {import('./resolve.js').ResolvedPlan} ResolvedPlan
 */

/**
 * A resolved plan as plain JSON for `DirectorResult.plan`.
 * @param {ResolvedPlan} plan
 * @returns {object}
 */
export function describePlan(plan) {
  const part = (/** @type {ResolvedPart} */ p) => ({
    file: p.media.handle,
    filename: p.media.relativePath,
    ...(p.start !== null && { start: round3(p.start) }),
    ...(p.end !== null && { end: round3(p.end) }),
    ...(p.duration !== null && { duration: p.duration }),
  });
  return {
    ...(plan.rationale && { rationale: plan.rationale }),
    ...(plan.title && { title: plan.title }),
    ...(plan.music && {
      music: { ...part({ ...plan.music, end: null, duration: null, basis: 'times' }) },
    }),
    picks: plan.picks.map((p) => ({
      ...part(p),
      role: p.role,
      ...(p.title && { title: p.title }),
      ...(p.note && { note: p.note }),
      ...(p.visuals.length && { visuals: p.visuals.map(part) }),
    })),
  };
}
