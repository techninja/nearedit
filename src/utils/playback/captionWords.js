/**
 * Words for the preview's captions — the transcript of each file a
 * captioned clip plays, taken from the sidecar cache the transcript panel
 * and the media bin already share (`#utils/media/sidecars.js`), so a file's
 * analysis is fetched once for all of them. A transcript that is not there
 * yet gives no words and `onArrive` asks for a repaint when it comes; a
 * correction made in the transcript panel, a transcription that has just
 * finished or a re-analysis replaces the words the same way, without a
 * reload — and until the new ones are there the old ones stay on screen.
 * Contract: docs/app-spec/COMPOSITOR.md § The host environment (`words`).
 * @module utils/playback/captionWords
 */

import { hasTranscript } from '#utils/captions/transcript.js';
import { loadSidecar, onSidecarChange } from '#utils/media/sidecars.js';

/** A transcript that could not be fetched is asked for again after this long, ms. */
const RETRY_MS = 5000;

/**
 * What is known about one file's transcript.
 * @typedef {Object} FileWords
 * @property {Record<string, any>|null} words - The sidecar when it holds a
 *   transcript, otherwise null. The same object until the transcript changes
 * @property {'loading'|'ready'|'none'|'failed'} state - `none`: the file
 *   has no transcript (not analysed, or nothing was said)
 * @property {number} asked - Which request the entry is waiting for
 * @property {number} retryAt - When a failed request may be made again, ms
 */

/**
 * Create the word source of a preview.
 * @param {() => void} onArrive - Words arrived, changed or went away
 * @param {Object} [io] - Injectable for tests
 * @param {(path: string) => Promise<Record<string, any>|null>} [io.load] - A file's sidecar
 * @param {(listener: (path: string) => void) => () => void} [io.watch] -
 *   Subscribe to sidecar changes; the listener gets the path, or '' for all
 * @param {() => number} [io.now] - The clock, ms
 */
export function createWordSource(onArrive, io = {}) {
  const { load = loadSidecar, watch = onSidecarChange, now = Date.now } = io;
  /** @type {Map<string, FileWords>} */
  const files = new Map();
  let requests = 0;

  /**
   * Fetch a file's transcript, for the first time or again.
   * @param {string} path
   * @returns {FileWords}
   */
  function fetch(path) {
    const entry = files.get(path) || { words: null, state: 'loading', asked: 0, retryAt: Infinity };
    const asked = ++requests;
    Object.assign(entry, { asked, retryAt: Infinity });
    files.set(path, entry);
    const settle = (/** @type {Partial<FileWords>} */ result) => {
      // Dropped, or asked again since: a newer answer is on its way.
      if (files.get(path) !== entry || entry.asked !== asked) return;
      const reworded = 'words' in result && result.words !== entry.words;
      const changed = reworded || result.state !== entry.state;
      Object.assign(entry, result);
      if (changed) onArrive();
    };
    load(path).then(
      (sidecar) =>
        settle(
          hasTranscript(sidecar)
            ? { words: sidecar, state: 'ready' }
            : { words: null, state: 'none' },
        ),
      (err) => {
        console.warn(`[captions] could not load the transcript of ${path}: ${err.message}`);
        settle({ state: entry.words ? 'ready' : 'failed', retryAt: now() + RETRY_MS });
      },
    );
    return entry;
  }

  const stopWatching = watch((path) => {
    // Only what the preview shows is fetched again; the old words stay meanwhile.
    for (const known of path ? [path] : [...files.keys()]) if (files.has(known)) fetch(known);
  });

  return {
    /**
     * The transcript of a clip's file, as the compositor's `env.words`
     * wants it; the first call for a file starts loading it.
     * @param {{ sourceFile?: string }} clip
     * @returns {Record<string, any>|null} null while it loads and when there is none
     */
    get(clip) {
      const path = clip?.sourceFile;
      if (!path) return null;
      const known = files.get(path);
      // The server was away: try again, but not on every frame.
      return (known && now() < known.retryAt ? known : fetch(path)).words;
    },

    /**
     * Where a file's transcript stands, for an interface that explains a
     * caption that does not show.
     * @param {string} path
     * @returns {FileWords['state']|'unknown'} `unknown`: never asked for
     */
    state: (path) => files.get(path)?.state || 'unknown',

    /** Stop following sidecar changes and forget every transcript. */
    destroy() {
      stopWatching();
      files.clear();
    },
  };
}
