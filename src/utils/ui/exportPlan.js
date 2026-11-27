/**
 * Export dialog logic — which ranges can be rendered, the file name, the
 * request body and the wording of the summary. Pure.
 * Route: `POST /api/render` (docs/app-spec/API.md § Render).
 * @module utils/ui/exportPlan
 */

import { timelineDuration } from '#utils/edl/query.js';
import { formatDuration } from '#utils/ui/format.js';

/**
 * @typedef {Object} RangeChoice
 * @property {'all'|'loop'} id
 * @property {string} label
 * @property {number} start - Seconds
 * @property {number} end - Seconds
 * @property {boolean} available
 * @property {string} hint
 */

const MIN_RANGE = 0.04; // about a frame: a loop region shorter than this is not a range

/**
 * The loop region as a render range.
 * @param {{ loopStart?: number, loopEnd?: number }} view
 * @param {number} duration - Timeline length in seconds
 * @returns {{ start: number, end: number }|null} null when no usable region is set
 */
export function loopRange(view, duration) {
  const start = Math.max(0, Number(view?.loopStart) || 0);
  const end = Math.min(duration, Number(view?.loopEnd) || 0);
  return end - start >= MIN_RANGE ? { start, end } : null;
}

/**
 * What can be rendered: the whole timeline, or the loop range when one is set.
 * @param {any} doc - The timeline document
 * @param {{ loopStart?: number, loopEnd?: number }} view
 * @returns {RangeChoice[]}
 */
export function rangeChoices(doc, view) {
  const duration = timelineDuration(doc);
  const loop = loopRange(view, duration);
  return [
    {
      id: 'all',
      label: 'Whole timeline',
      start: 0,
      end: duration,
      available: duration > 0,
      hint: duration > 0 ? formatDuration(duration) : 'The timeline is empty',
    },
    {
      id: 'loop',
      label: 'Loop range',
      start: loop?.start || 0,
      end: loop?.end || 0,
      available: Boolean(loop),
      hint: loop
        ? `${formatDuration(loop.start)} – ${formatDuration(loop.end)}`
        : 'Set a loop region on the timeline to export just that part',
    },
  ];
}

/**
 * A file name proposal from the adaptation's name. The server adds `.mp4`
 * and a number when the name is taken.
 * @param {string} adaptationName
 * @returns {string}
 */
export function defaultFilename(adaptationName) {
  const stem = String(adaptationName || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ._()-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stem || 'render';
}

/**
 * Why a typed file name cannot be used.
 * @param {string} filename
 * @returns {string} '' when it is fine
 */
export function filenameProblem(filename) {
  if (/[/\\]/.test(filename)) return 'A file name cannot contain slashes';
  if (filename.trim().length > 120) return 'At most 120 characters';
  return '';
}

/**
 * Body of `POST /api/render` (and `/api/render/plan`).
 * @param {{ projectId: string, adaptationId: string, doc: any, preset: string,
 *   range: RangeChoice, filename: string }} options
 * @returns {Record<string, any>}
 */
export function renderRequest({ projectId, adaptationId, doc, preset, range, filename }) {
  const body = { projectId, adaptationId, edl: doc, preset };
  if (range.id === 'loop') body.range = { start: range.start, end: range.end };
  const name = filename.trim().replace(/\.mp4$/i, '');
  if (name) body.filename = name;
  return body;
}

/**
 * "1920 × 1080 · 30 fps · 1:23" — what a render will be (or was).
 * @param {{ width?: number, height?: number, fps?: number, duration?: number }|null} facts
 * @returns {string}
 */
export function summaryText(facts) {
  if (!facts) return '';
  const parts = [];
  if (facts.width && facts.height) parts.push(`${facts.width} × ${facts.height}`);
  if (facts.fps) parts.push(`${Number(Number(facts.fps).toFixed(2))} fps`);
  if (facts.duration) parts.push(formatDuration(facts.duration));
  return parts.join(' · ');
}
