/**
 * Rendering is invisible: after a song changes, the server renders it and
 * the clip is pointed at the file — without anyone pressing anything and
 * without an undo step (`amend.js`). The document is watched; a little
 * after its last change every song without its rendering is asked for
 * (`POST /api/music/render`, which answers when the file exists). One
 * request per song at a time; a request nobody waits for any more — the
 * song changed again — is cancelled, so the latest song wins. Until its
 * rendering arrives a clip plays the one it had. A failure is kept with
 * the server's sentence and not tried again until the song changes or
 * somebody asks.
 * @module utils/musicUi/rendering
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { api } from '#utils/api/http.js';
import { getDoc, onDocChange } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { amendWhenIdle } from './amend.js';
import { attachRendering, failureText, isRendering, wantedRenderings } from './renderApply.js';
import { publishRenderings, renderState, renderStatusOf } from './renderState.js';

export { renderState, renderStatusOf };

/** Milliseconds a song must have been left alone before it is rendered. */
export const RENDER_DELAY = 450;
const WRONG_KEY =
  'The server renders this song differently from this page — reload the page to get its version';

/** @type {Map<string, AbortController>} Requests under way, by key */
const running = new Map();
/** @type {Map<string, string>} Why a key could not be rendered */
const failed = new Map();
/** @type {any} */
let timer = 0;
let watching = 0;

/** Say where every waiting clip stands. */
const publish = () => publishRenderings(wantedRenderings(getDoc()), failed);

/**
 * Ask for one song and attach what comes back.
 * @param {string} key
 * @param {any} song
 * @param {string} projectId
 */
async function request(key, song, projectId) {
  const controller = new AbortController();
  running.set(key, controller);
  try {
    const answer = await api('/music/render', {
      body: { projectId, song },
      signal: controller.signal,
    });
    if (!isRendering(answer))
      throw Object.assign(new Error('No rendering came back'), { status: 500 });
    if (answer.key !== key) failed.set(key, WRONG_KEY);
    else {
      const { autoCrossfade } = getView();
      await amendWhenIdle((doc) => attachRendering(doc, answer, { autoCrossfade }));
    }
  } catch (err) {
    if (!controller.signal.aborted) failed.set(key, failureText(err));
  } finally {
    if (running.get(key) === controller) running.delete(key);
    if (watching) syncRenderings();
    else publish();
  }
}

/**
 * Bring the requests in line with the document as it is now: cancel what
 * nobody waits for, ask for what is missing, and publish where things stand.
 */
export function syncRenderings() {
  clearTimeout(timer);
  timer = 0;
  const wanted = wantedRenderings(getDoc());
  for (const [key, controller] of running) if (!wanted.has(key)) controller.abort();
  for (const key of failed.keys()) if (!wanted.has(key)) failed.delete(key);
  const { projectId } = store.get(ProjectState);
  for (const [key, { song }] of wanted) {
    if (projectId && !running.has(key) && !failed.has(key)) request(key, song, projectId);
  }
  publish();
}

/**
 * Look at the document again a little later; calls made before that
 * replace one another.
 * @param {number} [delay]
 */
export function checkRenderings(delay = RENDER_DELAY) {
  clearTimeout(timer);
  timer = setTimeout(syncRenderings, delay);
  publish();
}

/**
 * Try a clip's rendering again after it failed.
 * @param {string} clipId
 */
export function retryRendering(clipId) {
  const status = renderStatusOf(clipId);
  if (status) failed.delete(status.key);
  syncRenderings();
}

/** Forget every request and every failure (another project, a test). */
export function resetRenderings() {
  clearTimeout(timer);
  for (const controller of running.values()) controller.abort();
  running.clear();
  failed.clear();
  renderState.set({ byClip: {} });
}

/**
 * Keep every music clip of the open document rendered — also the ones that
 * are out of date when a project opens.
 * @returns {() => void} Stop
 */
export function watchMusicRendering() {
  const stop = onDocChange((_doc, info) => {
    if (info.reason === 'load') failed.clear();
    if (!info.transient) checkRenderings();
  });
  watching += 1;
  checkRenderings();
  return () => {
    stop();
    watching -= 1;
    resetRenderings();
  };
}
