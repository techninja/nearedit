/**
 * The cutout's badge on timeline clips: "Cutout" on a clip that is drawn
 * through its matte, the same with a percentage while the cutout is being
 * made, and with an exclamation mark when it failed, was cancelled or
 * cannot be made here. Registered with the timeline's badge registry; the
 * timeline draws again whenever a job's state changes.
 * @module utils/cutoutUi/badge
 */

import { hasCutout } from '#utils/cutout/index.js';
import { getDoc } from '#utils/editor/session.js';
import { badgesChanged, registerClipBadge } from '#utils/timeline/badges.js';
import { isSubject, statusOf } from './clipStatus.js';
import { cutoutJobs } from './state.js';

/** @typedef {import('#utils/timeline/badges.js').ClipBadge} ClipBadge */

const ID = 'cutout';

/**
 * The badge of a clip.
 * @param {any} clip
 * @param {any} track
 * @param {number} fps - Of the document
 * @param {import('./state.js').FileJob|null|undefined} job - Of the clip's media file
 * @returns {ClipBadge|null} null for a clip without cutout
 */
export function cutoutBadge(clip, track, fps, job) {
  if (!hasCutout(clip) || !isSubject(clip, track)) return null;
  const status = statusOf(clip, fps, job);
  if (status.stage === 'off') return null;
  if (status.stage === 'ready')
    return { id: ID, text: 'Cutout', tone: 'on', title: 'The person is cut out of this clip' };
  if (status.stage === 'making') {
    const percent = job?.status === 'running' ? ` ${Math.round(status.progress)}%` : '…';
    const title = status.stale ? `Out of date. ${status.text}` : status.text;
    return { id: ID, text: `Cutout${percent}`, tone: 'busy', title };
  }
  const why = {
    failed: `The cutout failed: ${status.text}`,
    cancelled: 'The cutout was cancelled — the clip shows its background',
    unavailable: `No cutout: ${job?.message || status.text}`,
  };
  return { id: ID, text: 'Cutout !', tone: 'warn', title: why[status.stage] };
}

/**
 * Show the cutout's badge on the timeline.
 * @returns {() => void} Take it away again
 */
export function registerCutoutBadge() {
  const remove = registerClipBadge((clip, track) => {
    if (!hasCutout(clip)) return null; // most clips: nothing more is looked at
    const job = cutoutJobs.get().byPath[clip.sourceFile];
    return cutoutBadge(clip, track, getDoc().fps, job);
  });
  const stop = cutoutJobs.subscribe(() => badgesChanged());
  return () => {
    stop();
    remove();
  };
}
