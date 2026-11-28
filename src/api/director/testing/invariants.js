/**
 * Invariant checker for DirectorResult fragments, used by the tests.
 * Checks the rules of docs/app-spec/EDL.md § Invariants plus the
 * DirectorResult contract of docs/app-spec/API.md.
 * @module api/director/testing/invariants
 */

import { existsSync } from 'node:fs';
import { clipKind } from '#utils/edl/factory.js';
import { defaultText, defaultTransform } from '#utils/edl/defaults.js';

const TOLERANCE = 1e-6;
const MODES = ['replace', 'append', 'prepend', 'insert', 'range'];

/**
 * Whether a time sits on a frame boundary.
 * @param {number} time
 * @param {number} fps
 * @returns {boolean}
 */
function onFrame(time, fps) {
  return Math.abs(time * fps - Math.round(time * fps)) < 1e-4;
}

/**
 * Problems with the clips of one track.
 * @param {any} track
 * @param {{ fps: number, durations?: Record<string, number|null> }} opts
 * @returns {string[]}
 */
function checkTrack(track, opts) {
  const errors = [];
  const where = `${track.type}[${track.index}]`;
  const clips = [...track.clips].sort((a, b) => a.timelineStart - b.timelineStart);
  clips.forEach((clip, i) => {
    const id = `${where} ${clip.clipId}`;
    const length = clip.timelineEnd - clip.timelineStart;
    const kind = clipKind(clip, track);
    for (const key of Object.keys(defaultTransform()))
      if (clip.transform?.[key] === undefined) errors.push(`${id}: transform.${key} missing`);
    for (const key of Object.keys(defaultText()))
      if (clip.text?.[key] === undefined) errors.push(`${id}: text.${key} missing`);
    if (!(clip.timelineStart >= 0) || !(length > 0)) errors.push(`${id}: bad timeline span`);
    for (const key of ['timelineStart', 'timelineEnd'])
      if (!onFrame(clip[key], opts.fps))
        errors.push(`${id}: ${key} ${clip[key]} off the frame grid`);
    if (clip.fadeIn < 0 || clip.fadeOut < 0 || clip.fadeIn + clip.fadeOut > length + TOLERANCE)
      errors.push(`${id}: fades longer than the clip`);
    if (kind === 'video' || kind === 'audio') {
      if (Math.abs(clip.sourceOut - clip.sourceIn - length) > TOLERANCE)
        errors.push(
          `${id}: source span ${clip.sourceOut - clip.sourceIn} ≠ timeline span ${length}`,
        );
      if (clip.sourceIn < 0) errors.push(`${id}: negative sourceIn`);
      const known = opts.durations?.[clip.sourceFile];
      if (known && clip.sourceOut > known + 0.05)
        errors.push(`${id}: sourceOut ${clip.sourceOut} past the source end ${known}`);
    }
    if (kind === 'audio' && track.type !== 'audio')
      errors.push(`${id}: audio file on a video track`);
    if (['title', 'image', 'element'].includes(kind) && track.type !== 'video')
      errors.push(`${id}: ${kind} on an audio track`);
    // An element clip carries its design, so the document draws with no kit at hand.
    if (clip.element !== undefined && kind !== 'element')
      errors.push(`${id}: an element block without a design`);
    if (clip.sourceFile && !existsSync(clip.sourceFile))
      errors.push(`${id}: missing ${clip.sourceFile}`);
    const next = clips[i + 1];
    if (!next || next.timelineStart >= clip.timelineEnd - TOLERANCE) return;
    const overlap = clip.timelineEnd - next.timelineStart;
    const crossFade =
      Math.abs(clip.fadeOut - overlap) < TOLERANCE && Math.abs(next.fadeIn - overlap) < TOLERANCE;
    if (!crossFade)
      errors.push(`${id}: overlaps ${next.clipId} by ${overlap} without a cross-fade`);
    const third = clips[i + 2];
    if (third && third.timelineStart < clip.timelineEnd - TOLERANCE)
      errors.push(`${id}: three clips cover one point`);
  });
  return errors;
}

/**
 * Every way a DirectorResult breaks the contract. Empty means valid.
 * @param {any} result
 * @param {{ fps?: number, durations?: Record<string, number|null>, roots?: string[],
 *   edl?: any }} [opts] - `durations`: known source lengths by path; `roots`: folders every
 *   sourceFile must be under; `edl`: the document an in-place result was made from. Such a
 *   result sends locked tracks empty, so a clip of it may be linked to a clip that is not
 *   in the fragment: its partner on a locked track of that document, linked back. The two
 *   need not be in step — a locked clip cannot follow a ripple
 * @returns {string[]}
 */
export function checkResult(result, opts = {}) {
  const fps = opts.fps || 30;
  const errors = [];
  if (!MODES.includes(result.mode)) errors.push(`bad mode ${result.mode}`);
  if (typeof result.summary !== 'string' || !result.summary) errors.push('summary missing');
  if (!Array.isArray(result.notes)) errors.push('notes missing');
  if (!Array.isArray(result.markers)) errors.push('markers missing');
  if (result.mode === 'range' && !(result.range?.end > result.range?.start))
    errors.push('range missing');
  const byId = new Map();
  const slots = new Set();
  for (const track of result.tracks || []) {
    if (!['video', 'audio'].includes(track.type) || !Number.isInteger(track.index) || !track.name)
      errors.push(`bad track ${JSON.stringify({ ...track, clips: undefined })}`);
    if (slots.has(`${track.type}${track.index}`))
      errors.push(`duplicate ${track.type}[${track.index}]`);
    slots.add(`${track.type}${track.index}`);
    errors.push(...checkTrack(track, { fps, durations: opts.durations }));
    for (const clip of track.clips) {
      if (byId.has(clip.clipId)) errors.push(`duplicate clipId ${clip.clipId}`);
      byId.set(clip.clipId, clip);
      if (clip.sourceFile && opts.roots && !opts.roots.some((r) => clip.sourceFile.startsWith(r)))
        errors.push(`${clip.clipId}: ${clip.sourceFile} is outside the project`);
    }
  }
  const locked = new Map(
    (opts.edl?.tracks || [])
      .filter((/** @type {any} */ track) => track.locked)
      .flatMap((/** @type {any} */ track) => track.clips)
      .map((/** @type {any} */ clip) => [clip.clipId, clip]),
  );
  for (const clip of byId.values()) {
    if (locked.has(clip.clipId)) errors.push(`${clip.clipId}: a clip of a locked track was sent`);
    if (!clip.linkedClipId) continue;
    const partner = byId.get(clip.linkedClipId);
    const kept = locked.get(clip.linkedClipId);
    if (!partner && kept) {
      if (kept.linkedClipId !== clip.clipId)
        errors.push(`${clip.clipId}: ${kept.clipId} on a locked track is not linked to it`);
    } else if (!partner)
      errors.push(`${clip.clipId}: linked clip ${clip.linkedClipId} not in the fragment`);
    else if (partner.linkedClipId !== clip.clipId)
      errors.push(`${clip.clipId}: link is not symmetric`);
    else if (
      Math.abs(partner.timelineStart - clip.timelineStart) > TOLERANCE ||
      Math.abs(partner.timelineEnd - clip.timelineEnd) > TOLERANCE ||
      Math.abs(partner.sourceIn - clip.sourceIn) > TOLERANCE
    )
      errors.push(`${clip.clipId}: out of sync with its linked clip`);
  }
  for (const marker of result.markers || [])
    if (!marker.markerId || !(marker.time >= 0))
      errors.push(`bad marker ${JSON.stringify(marker)}`);
  return errors;
}
