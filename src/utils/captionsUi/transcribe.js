/**
 * Transcribing a file from the captions interface: one background job per
 * file (the same job the transcript panel starts), its progress where every
 * panel can show it, and whether this server can transcribe at all. When a
 * job finishes the file's cached sidecar is dropped, so captions that are
 * switched on appear by themselves.
 * Routes: docs/app-spec/API.md § Intelligence.
 * @module utils/captionsUi/transcribe
 */

import { intelligenceStatus, transcribeMedia } from '#utils/media/analyze.js';
import { libraryStatus, loadLibrary } from '#utils/media/library.js';
import { forgetSidecars } from '#utils/media/sidecars.js';
import { createObservable } from '#utils/ui/observable.js';

/**
 * Where the transcription of one file stands.
 * @typedef {Object} FileJob
 * @property {boolean} active - Still running
 * @property {number} progress - 0..100
 * @property {string} label - What the job says it is doing
 * @property {string} detail - The job's latest log line
 * @property {string} error - Why it failed; '' while running and after success
 */

/**
 * @typedef {Object} TranscribeState
 * @property {Record<string, FileJob>} byFile - By absolute path
 * @property {Record<string, any>|null} provider - `transcription` of
 *   GET /intelligence/status; null until asked
 */

/** @type {import('#utils/ui/observable.js').Observable<TranscribeState>} */
export const transcribeState = createObservable({ byFile: {}, provider: null });

/** @type {Map<string, AbortController>} */
const running = new Map();

/**
 * @param {string} file
 * @param {FileJob|null} job - null forgets the file
 */
function setJob(file, job) {
  const byFile = { ...transcribeState.get().byFile };
  if (job) byFile[file] = job;
  else delete byFile[file];
  transcribeState.set({ byFile });
}

/**
 * @param {string} file
 * @returns {FileJob|null} The file's job; null when none ran or the last one succeeded
 */
export const jobOf = (file) => transcribeState.get().byFile[file] || null;

/**
 * Learn whether this server can transcribe (cheap: answers are shared).
 * @param {{ refresh?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export function loadProvider(opts = {}) {
  return intelligenceStatus(opts)
    .then((status) => {
      const provider = status?.transcription || null;
      if (provider !== transcribeState.get().provider) transcribeState.set({ provider });
    })
    .catch((err) => console.warn('[captions] the transcription provider is unknown:', err.message));
}

/**
 * Transcribe a file. Asking again while it runs changes nothing.
 * @param {string} file - Absolute path
 * @returns {Promise<boolean>} True when the file now has a fresh transcript
 */
export async function transcribeFile(file) {
  if (!file || running.has(file)) return false;
  const controller = new AbortController();
  running.set(file, controller);
  setJob(file, {
    active: true,
    progress: 0,
    label: 'Starting transcription…',
    detail: '',
    error: '',
  });
  try {
    await transcribeMedia(file, {
      signal: controller.signal,
      onUpdate: ({ label, progress, log }) =>
        setJob(file, {
          active: true,
          progress: Math.round(progress || 0),
          label: label || 'Transcribing…',
          detail: log?.[log.length - 1] || '',
          error: '',
        }),
    });
    setJob(file, null);
    forgetSidecars(file);
    // The library says which files have a transcript: the transcript panel lists those.
    if (libraryStatus().projectId) void loadLibrary();
    return true;
  } catch (err) {
    const cancelled = err.message === 'Cancelled';
    const error = cancelled ? '' : [err.message, err.body?.detail].filter(Boolean).join(' — ');
    setJob(file, cancelled ? null : { active: false, progress: 0, label: '', detail: '', error });
    // No provider after all: say so where the button was.
    if (err.status === 503) loadProvider({ refresh: true });
    return false;
  } finally {
    running.delete(file);
  }
}

/**
 * Stop transcribing a file.
 * @param {string} file
 */
export function cancelTranscribe(file) {
  running.get(file)?.abort();
}
