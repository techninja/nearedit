/**
 * What the editor knows about the transcripts captions are made from: for
 * each file, whether it has words, which, and the sidecar they come from.
 * Asked for synchronously — a badge on a clip, a line in the inspector —
 * and answered from the sidecar cache the preview, the transcript panel
 * and the media bin share; the first question about a file starts loading
 * it and subscribers hear when the answer is there. A transcription that
 * finishes or a corrected word replaces the answer the same way, and until
 * the new one arrives the old one stands.
 * @module utils/captionsUi/words
 */

import { hasTranscript, wordsFromTranscript } from '#utils/captions/transcript.js';
import { loadSidecar, onSidecarChange } from '#utils/media/sidecars.js';

/**
 * What is known about one file.
 * @typedef {Object} FileWords
 * @property {'loading'|'ready'|'none'|'failed'} state - `none`: no
 *   transcript (never transcribed, or nothing was said)
 * @property {import('#utils/captions/types.js').Word[]} words - In source
 *   seconds; empty unless `ready`
 * @property {Record<string, any>|null} sidecar - The file's sidecar, when it has one
 */

/** @typedef {FileWords & { asked: number, retryAt: number, pending: Promise<void> }} Entry */

/** A sidecar that could not be fetched is asked for again after this long, ms. */
const RETRY_MS = 5000;
/** @type {FileWords} */
const NOTHING = Object.freeze({ state: 'none', words: [], sidecar: null });

/**
 * A book of transcripts.
 * @param {Object} [io] - Injectable for tests
 * @param {(path: string) => Promise<Record<string, any>|null>} [io.load] - A file's sidecar
 * @param {(listener: (path: string) => void) => () => void} [io.watch] -
 *   Subscribe to sidecar changes; the listener gets the path, or '' for all
 * @param {() => number} [io.now] - The clock, ms
 */
export function createWordBook(io = {}) {
  const { load = loadSidecar, watch = onSidecarChange, now = Date.now } = io;
  /** @type {Map<string, Entry>} */
  const files = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();
  let requests = 0;
  let revision = 0;

  /**
   * Fetch a file's sidecar, for the first time or again.
   * @param {string} path
   * @returns {Entry}
   */
  function fetch(path) {
    /** @type {Entry} */
    const entry = files.get(path) || {
      state: 'loading',
      words: [],
      sidecar: null,
      asked: 0,
      retryAt: Infinity,
      pending: Promise.resolve(),
    };
    const asked = ++requests;
    Object.assign(entry, { asked, retryAt: Infinity });
    files.set(path, entry);
    const settle = (/** @type {Partial<Entry>} */ result) => {
      // Dropped, or asked again since: a newer answer is on its way.
      if (files.get(path) !== entry || entry.asked !== asked) return;
      Object.assign(entry, result);
      revision++;
      for (const listener of [...listeners]) listener();
    };
    entry.pending = load(path).then(
      (sidecar) =>
        settle(
          hasTranscript(sidecar)
            ? { state: 'ready', words: wordsFromTranscript(sidecar), sidecar }
            : { state: 'none', words: [], sidecar: sidecar || null },
        ),
      (err) => {
        console.warn(`[captions] could not read the transcript of ${path}: ${err.message}`);
        // Words that were there stay on; either way the file is asked for again later.
        const state = entry.state === 'ready' ? 'ready' : 'failed';
        settle({ state, retryAt: now() + RETRY_MS });
        // Whoever shows the file is told when it is time to ask again.
        const timer = setTimeout(() => settle({}), RETRY_MS);
        /** @type {any} */ (timer).unref?.();
      },
    );
    return entry;
  }

  /** @param {string} path @returns {Entry} What is known, asking when it is time to */
  const lookUp = (path) => {
    const known = files.get(path);
    return known && now() < known.retryAt ? known : fetch(path);
  };

  const stopWatching = watch((path) => {
    for (const known of path ? [path] : [...files.keys()]) if (files.has(known)) fetch(known);
  });

  return {
    /**
     * @param {string|undefined} path - A media file
     * @returns {FileWords} What is known now; the first call starts loading
     */
    get: (path) => (path ? lookUp(path) : NOTHING),
    /**
     * @param {string[]} paths
     * @returns {Promise<void>} Settled once none of them is still loading
     */
    ready: (paths) =>
      Promise.all(paths.filter(Boolean).map((path) => lookUp(path).pending)).then(() => undefined),
    /** @returns {number} Grows with every answer: something to watch */
    revision: () => revision,
    /**
     * @param {() => void} listener - An answer arrived or changed
     * @returns {() => void} Stop listening
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Stop following sidecar changes and forget everything. */
    destroy() {
      stopWatching();
      files.clear();
      listeners.clear();
    },
  };
}

/** The editor's book. */
export const wordBook = createWordBook();

/** What a component watches to follow the book (`watch(wordsSignal)`). */
export const wordsSignal = { get: wordBook.revision, subscribe: wordBook.subscribe };

/**
 * @param {{ sourceFile?: string }} clip
 * @returns {boolean} True when the transcript of the clip's file is known to have words
 */
export const hasWords = (clip) => wordBook.get(clip?.sourceFile).state === 'ready';
