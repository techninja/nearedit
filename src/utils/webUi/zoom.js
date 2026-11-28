/**
 * Zoom on a web clip, from the inspector: fetch the track of the clip's
 * recording, write zoom keyframes for its clicks and focus steps
 * (`applyWebZoom`), or take them away again (`clearWebZoom`). The two
 * settings — how much room to leave around a target, how close to go — are
 * kept between sessions.
 * @module utils/webUi/zoom
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { api, query } from '#utils/api/http.js';
import { findClip } from '#utils/edl/query.js';
import { applyWebZoom, clearWebZoom } from '#utils/edl/webZoom.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { finishEdit } from '#utils/inspector/gesture.js';
import { createObservable } from '#utils/ui/observable.js';
import { readStored, writeStored } from '#utils/ui/storage.js';
import { ZOOM_PATHS } from '#utils/web/index.js';
import { errorText } from './snapshot.js';

export const ZOOM_KEY = 'nearedit_webZoom';
/** The ranges of the two settings: `[min, max, step]`. */
export const ZOOM_RANGES = { margin: [0, 2, 0.05], maxZoom: [1, 8, 0.1] };
const DEFAULTS = { margin: 0.35, maxZoom: 2.2 };

/** @type {Map<string, any>} Tracks by recording key */
const tracks = new Map();

/**
 * @param {any} stored
 * @returns {{ margin: number, maxZoom: number }} Settings inside their ranges
 */
export function zoomSettings(stored) {
  const within = (/** @type {'margin'|'maxZoom'} */ name) => {
    const [min, max] = ZOOM_RANGES[name];
    const value = Number(stored?.[name]);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : DEFAULTS[name];
  };
  return { margin: within('margin'), maxZoom: within('maxZoom') };
}

/** @type {import('#utils/ui/observable.js').Observable<{ margin: number, maxZoom: number }>} */
export const zoomOptions = createObservable(zoomSettings(readStored(ZOOM_KEY)));

/**
 * @param {any} clip
 * @returns {boolean} True when the clip has keys on the paths zoom writes
 */
export const hasZoom = (clip) =>
  Object.keys(ZOOM_PATHS).some((path) => clip?.keyframes?.[path]?.length > 0);

/** Keep a track that came with a job's result. @param {any} track */
export function rememberTrack(track) {
  if (track && typeof track.key === 'string') tracks.set(track.key, track);
}

/**
 * The track of the recording a clip shows.
 * @param {any} clip
 * @returns {Promise<any>}
 * @throws {Error} When the clip is not recorded or the server has no such recording
 */
export async function trackOf(clip) {
  const key = clip?.web?.key;
  if (!key) throw new Error('Record the clip first: zoom follows what was recorded');
  if (!tracks.has(key)) {
    const { projectId } = store.get(ProjectState);
    rememberTrack(await api(`/web/track${query({ projectId, key })}`));
  }
  return tracks.get(key);
}

/**
 * Zoom a web clip in on its clicks and focus steps. One undo step.
 * @param {string} clipId
 * @returns {Promise<string>} '' when it worked, otherwise why not
 */
export async function applyZoom(clipId) {
  try {
    const track = await trackOf(findClip(getDoc(), clipId)?.clip);
    finishEdit();
    const options = { clicks: true, ...zoomOptions.get() };
    const changed = edit((doc) => applyWebZoom(doc, clipId, track, options));
    if (changed || hasZoom(findClip(getDoc(), clipId)?.clip)) return '';
    return 'There is nothing to zoom in on: the recording has no click, typing or focus step';
  } catch (err) {
    return errorText(err);
  }
}

/** Remove the zoom keyframes of a clip. @param {string} clipId @returns {boolean} */
export function removeZoom(clipId) {
  finishEdit();
  return edit((doc) => clearWebZoom(doc, clipId));
}

/**
 * Change a zoom setting; a clip that is zoomed is zoomed again with it.
 * @param {'margin'|'maxZoom'} name
 * @param {number} value
 * @param {string} [clipId] - The clip the inspector shows
 * @returns {Promise<string>} As `applyZoom`
 */
export async function setZoomOption(name, value, clipId) {
  const next = zoomSettings({ ...zoomOptions.get(), [name]: value });
  zoomOptions.set(next);
  writeStored(ZOOM_KEY, next);
  const clip = clipId ? findClip(getDoc(), clipId)?.clip : null;
  return clip && hasZoom(clip) ? applyZoom(clipId) : '';
}
