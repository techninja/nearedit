/**
 * The one place a web clip gets recorded: starts the `web` job for a clip,
 * follows it (it shows in the job tray like any job and carries on when
 * the web editor is closed), and attaches the finished recording — only
 * where the recipe still asks for it (`recordingApply.js`). Recordings
 * finished by jobs this page did not start (begun before a reload, or by
 * the director) are attached the same way.
 * @module utils/webUi/recording
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { runJob } from '#utils/api/jobs.js';
import { edit, getDoc, inGesture } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { finishEdit } from '#utils/inspector/gesture.js';
import { onJobFinished } from '#utils/ui/jobCenter.js';
import { createObservable } from '#utils/ui/observable.js';
import { recipeKey } from '#utils/web/index.js';
import { isRecording, webClipsToRecord } from './clipStatus.js';
import {
  OUTCOME_TEXT,
  attachRecording,
  recordRequest,
  recordingOutcome,
} from './recordingApply.js';
import { errorText } from './snapshot.js';
import { rememberTrack } from './zoom.js';

/** @typedef {import('./clipStatus.js').RecordingProgress} RecordingProgress */
/** @typedef {import('./recordingApply.js').RecordingResult} RecordingResult */

/** @type {import('#utils/ui/observable.js').Observable<{ byClip: Record<string, RecordingProgress> }>} */
export const recordingState = createObservable({ byClip: {} });
/** @type {Map<string, AbortController>} */
const running = new Map();
const RETRY_MS = 120;

/**
 * @param {string} clipId
 * @returns {RecordingProgress|null} The recording of a clip, under way or just ended
 */
export const recordingOf = (clipId) => recordingState.get().byClip[clipId] || null;

/**
 * @param {string} clipId
 * @param {Partial<RecordingProgress>} patch
 */
function note(clipId, patch) {
  const before = recordingOf(clipId) || { status: 'starting', progress: 0, message: '' };
  recordingState.set(({ byClip }) => ({
    byClip: { ...byClip, [clipId]: { ...before, ...patch } },
  }));
}

/**
 * Attach a finished recording to the clips waiting for it, as one undo
 * step. A drag on the timeline is let finish first: it works from the
 * document it started with and would throw the recording away.
 * @param {RecordingResult} result
 */
export function attachWhenIdle(result) {
  if (inGesture()) return void setTimeout(() => attachWhenIdle(result), RETRY_MS);
  finishEdit();
  const { autoCrossfade } = getView();
  edit((doc) => attachRecording(doc, result, { autoCrossfade }).doc);
}

/**
 * Record a clip: start the job, follow it, attach the result.
 * @param {string} clipId
 * @returns {Promise<RecordingProgress>} How it ended
 */
export async function recordClip(clipId) {
  if (isRecording(recordingOf(clipId))) return recordingOf(clipId);
  const { body, problem } = recordRequest(getDoc(), clipId, store.get(ProjectState).projectId);
  if (!body) {
    note(clipId, { status: 'error', progress: 0, message: problem });
    return recordingOf(clipId);
  }
  const key = recipeKey(body.recipe, body.fps);
  note(clipId, { status: 'starting', progress: 0, message: '', warnings: [], key });
  const controller = new AbortController();
  running.set(clipId, controller);
  try {
    const result = await runJob('/web/record', body, {
      signal: controller.signal,
      onUpdate: (job) =>
        note(clipId, {
          status: job.status === 'queued' ? 'queued' : 'running',
          progress: job.progress || 0,
        }),
    });
    rememberTrack(result.track);
    const outcome = recordingOutcome(getDoc(), clipId, result);
    attachWhenIdle(result);
    const attached = outcome === 'attached';
    const warnings = Array.isArray(result.track?.warnings) ? result.track.warnings : [];
    const message = attached ? '' : OUTCOME_TEXT[outcome];
    note(clipId, { status: attached ? 'done' : 'error', progress: 100, message, warnings });
  } catch (err) {
    const cancelled = err.message === 'Cancelled';
    note(clipId, {
      status: cancelled ? 'cancelled' : 'error',
      message: cancelled ? '' : errorText(err),
    });
  } finally {
    if (running.get(clipId) === controller) running.delete(clipId);
  }
  return recordingOf(clipId);
}

/** Cancel the recording of a clip: the browser stops and no file is left. @param {string} clipId */
export function cancelRecording(clipId) {
  running.get(clipId)?.abort();
}

/**
 * Record every web clip that was never recorded or is out of date. The
 * server makes them one at a time; each has its own job.
 * @returns {Promise<{ recorded: number, failed: number }>}
 */
export async function recordAllStale() {
  const { unrecorded, stale } = webClipsToRecord(getDoc());
  const ended = await Promise.all([...unrecorded, ...stale].map(recordClip));
  const recorded = ended.filter((each) => each?.status === 'done').length;
  return { recorded, failed: ended.length - recorded };
}

/**
 * Attach the recordings of `web` jobs of this project that finish, whoever
 * started them.
 * @returns {() => void} Stop
 */
export function watchWebJobs() {
  return onJobFinished((job) => {
    const { projectId } = store.get(ProjectState);
    if (job.type !== 'web' || job.status !== 'complete' || job.projectId !== projectId) return;
    const { file, key, duration, title } = job.result || {};
    if (typeof file !== 'string' || typeof key !== 'string') return;
    const named = typeof title === 'string' ? { title } : {};
    attachWhenIdle({ file, key, duration: Number(duration), ...named });
  });
}
