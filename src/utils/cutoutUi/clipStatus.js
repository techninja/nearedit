/**
 * Where a clip's cutout stands, in words: made, being made (which frame of
 * how many), out of date, failed, cancelled, or impossible on this server.
 * The document says whether a cutout is there (`cutoutState`); the job of
 * the clip's media file says the rest. Also which clips of a selection can
 * be cut out, and which clips of a document still wait for theirs. Pure and
 * isomorphic.
 * @module utils/cutoutUi/clipStatus
 */

import { canCutout, cutoutState } from '#utils/edl/index.js';
import { isWebClip } from '#utils/web/index.js';
import { fileName, isMaking } from './state.js';

/** @typedef {import('./state.js').FileJob} FileJob */
/** @typedef {'off'|'ready'|'making'|'failed'|'cancelled'|'unavailable'} Stage */

/**
 * @typedef {Object} CutoutStatus
 * @property {Stage} stage
 * @property {boolean} stale - A cutout is attached but no longer covers the clip
 * @property {string} text - One line for the inspector
 * @property {number} progress - 0..100 while it is being made
 * @property {''|'cancel'|'retry'} action - What the person can do about it
 */

/**
 * @param {any} clip
 * @param {any} track
 * @returns {boolean} True for a clip the interface offers the cutout for:
 *   footage on a video track, but not the recording of a web page
 */
export const isSubject = (clip, track) => canCutout(clip, track) && !isWebClip(clip);

/**
 * The status of a clip's cutout.
 * @param {any} clip
 * @param {number} fps - Of the document
 * @param {FileJob|null|undefined} job - The job of the clip's media file
 * @returns {CutoutStatus}
 */
export function statusOf(clip, fps, job) {
  const state = cutoutState(clip, fps);
  const stale = state === 'stale';
  const base = { stale, progress: 0, action: /** @type {CutoutStatus['action']} */ ('') };
  if (state === 'off') return { ...base, stage: 'off', text: '' };
  if (state === 'ready') return { ...base, stage: 'ready', text: 'The person is cut out' };
  const rest = stale ? 'the rest' : 'the cutout';
  if (!job || isMaking(job)) {
    const counted = job?.status === 'running' && job.frames > 0;
    const waits = job?.status === 'queued' ? 'Waiting for its turn…' : 'Starting…';
    const text = counted ? `Making ${rest} — frame ${job.frame} of ${job.frames}` : waits;
    return { ...base, stage: 'making', text, progress: job?.progress || 0, action: 'cancel' };
  }
  if (job.status === 'unavailable')
    return { ...base, stage: 'unavailable', text: 'This server cannot make cutouts' };
  if (job.status === 'cancelled')
    return {
      ...base,
      stage: 'cancelled',
      text: `Cancelled — ${rest} was not made`,
      action: 'retry',
    };
  return { ...base, stage: 'failed', text: job.message || 'It failed', action: 'retry' };
}

/**
 * The clips of a document that a render would show with their background:
 * cutout on, but not (wholly) made.
 * @param {any} doc
 * @returns {{ clipId: string, path: string, name: string }[]}
 */
export function clipsWaiting(doc) {
  const waiting = [];
  for (const track of doc?.tracks || []) {
    for (const clip of track.clips || []) {
      const state = cutoutState(clip, doc.fps);
      if (state !== 'missing' && state !== 'stale') continue;
      if (!canCutout(clip, track)) continue;
      const name = clip.label || fileName(clip.sourceFile);
      waiting.push({ clipId: clip.clipId, path: clip.sourceFile, name });
    }
  }
  return waiting;
}
