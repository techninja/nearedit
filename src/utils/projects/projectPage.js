/**
 * Project page state: the project, its media, the provider status and its
 * finished renders. The page calls `openProjectPage(id)` on entry; the
 * organisms read `projectPageState` and call the actions in
 * `projectActions.js` and `adaptationActions.js`.
 * @module utils/projects/projectPage
 */

import { api, query } from '#utils/api/http.js';
import { getProject, getProviderStatus, listRenders } from '#utils/projects/api.js';
import { jobState, onJobFinished } from '#utils/ui/jobCenter.js';
import { isActive } from '#utils/ui/jobList.js';
import { createObservable } from '#utils/ui/observable.js';

/**
 * @typedef {Object} ProjectPageState
 * @property {string} id
 * @property {import('#utils/projects/api.js').Project|null} project
 * @property {boolean} loading
 * @property {boolean} notFound - The server knows no such project
 * @property {string} error - Any other reason the project could not be loaded
 * @property {import('#utils/media/library.js').MediaItem[]} media
 * @property {boolean} mediaLoading
 * @property {string} mediaError
 * @property {any} status - Provider status; null until loaded
 * @property {any[]} renders
 * @property {import('#utils/projects/adaptationActions.js').AdaptationDialog|null} dialog
 */

const EMPTY = {
  id: '',
  project: null,
  loading: true,
  notFound: false,
  error: '',
  media: [],
  mediaLoading: false,
  mediaError: '',
  status: null,
  renders: [],
  dialog: null,
};

/** @type {import('#utils/ui/observable.js').Observable<ProjectPageState>} */
export const projectPageState = createObservable({ ...EMPTY });

const ANALYSIS_TYPES = ['analyze', 'index', 'transcribe', 'tag', 'beats', 'scenes', 'silence'];
const MEDIA_REFRESH_MS = 2500;
let lastMediaLoad = 0;

/** Still showing the project a request was made for? @param {string} id @returns {boolean} */
const current = (id) => projectPageState.get().id === id;

/** (Re)load the project itself. @returns {Promise<void>} */
export async function reloadProject() {
  const { id } = projectPageState.get();
  try {
    const project = await getProject(id);
    if (current(id)) projectPageState.set({ project, loading: false, notFound: false, error: '' });
  } catch (err) {
    if (!current(id)) return;
    const notFound = err.status === 404;
    projectPageState.set({ loading: false, notFound, error: notFound ? '' : err.message });
  }
}

/** (Re)scan the project's media folders. @returns {Promise<void>} */
export async function reloadMedia() {
  const { id } = projectPageState.get();
  lastMediaLoad = Date.now();
  projectPageState.set({ mediaLoading: true });
  try {
    const { data } = await api(`/media${query({ projectId: id })}`);
    if (current(id)) projectPageState.set({ media: data, mediaLoading: false, mediaError: '' });
  } catch (err) {
    if (current(id)) projectPageState.set({ mediaLoading: false, mediaError: err.message });
  }
}

/** Ask the server which providers are set up. @returns {Promise<void>} */
export async function reloadStatus() {
  const { id } = projectPageState.get();
  try {
    const status = await getProviderStatus();
    if (current(id)) projectPageState.set({ status });
  } catch (err) {
    console.warn('[project] could not read the provider status:', err.message);
  }
}

/** (Re)load the finished renders. @returns {Promise<void>} */
export async function reloadRenders() {
  const { id } = projectPageState.get();
  try {
    const renders = await listRenders(id);
    if (current(id)) projectPageState.set({ renders });
  } catch (err) {
    console.warn('[project] could not list the renders:', err.message);
  }
}

/**
 * The analysis job running for the open project, if any.
 * @param {import('#utils/api/jobs.js').JobSummary[]} jobs
 * @param {string} projectId
 * @returns {import('#utils/api/jobs.js').JobSummary|undefined}
 */
export function runningAnalysis(jobs, projectId) {
  return jobs.find((job) => job.projectId === projectId && job.type === 'analyze' && isActive(job));
}

/**
 * Open a project on the page.
 * @param {string} id
 * @returns {() => void} Call when leaving the page
 */
export function openProjectPage(id) {
  projectPageState.set({ ...EMPTY, id });
  reloadProject();
  reloadMedia();
  reloadStatus();
  reloadRenders();
  const stopFinished = onJobFinished((job) => {
    if (job.projectId !== id) return;
    if (ANALYSIS_TYPES.includes(job.type)) reloadMedia();
    if (job.type === 'render') reloadRenders();
  });
  // While an analysis runs, the coverage is refreshed as files get done.
  const stopProgress = jobState.subscribe(({ jobs }) => {
    const due = Date.now() - lastMediaLoad > MEDIA_REFRESH_MS;
    if (due && runningAnalysis(jobs, id)) reloadMedia();
  });
  return () => {
    stopFinished();
    stopProgress();
    projectPageState.set({ ...EMPTY });
  };
}
