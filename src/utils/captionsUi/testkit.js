/**
 * Fixtures for tests of the captions interface: a timeline with speech
 * that has a transcript, speech that has none and music, and what the word
 * book would say about each file. Not part of the runtime — import it from
 * tests.
 * @module utils/captionsUi/testkit
 */

import { wordsFromTranscript } from '#utils/captions/transcript.js';
import { testClip, testEdl } from '#utils/edl/testkit.js';

export const TALK = '/media/talk.mp4';
export const MEMO = '/media/memo.wav';
export const SONG = '/media/song.mp3';

/** Eight words, one every half second from 1 s on. */
export const TALK_SIDECAR = {
  transcript: 'We arrived at the park early this morning.'
    .split(' ')
    .map((word, i) => ({ word, start: 1 + i * 0.5, end: 1.4 + i * 0.5 })),
};

/**
 * A talk as linked picture (`v`) and sound (`a`) playing 0–6 s of its file,
 * a memo without a transcript (`memo`) after it, and a music bed (`bed`).
 * @param {{ captions?: any }} [opts] - `captions`: the sound clip's block
 * @returns {import('#utils/edl/types.js').Edl}
 */
export function talkDoc(opts = {}) {
  const pair = (/** @type {string} */ id, /** @type {string} */ partner, extra = {}) =>
    testClip(id, 0, 6, { sourceFile: TALK, linkedClipId: partner, ...extra });
  return testEdl({
    v1: [pair('v', 'a')],
    a1: [
      pair('a', 'v', opts.captions ? { captions: opts.captions } : {}),
      testClip('memo', 6, 10, { sourceFile: MEMO }),
    ],
    a2: [testClip('bed', 0, 10, { sourceFile: SONG })],
  });
}

/**
 * What a word book knows after reading the fixture's sidecars.
 * @param {Record<string, import('./words.js').FileWords['state']>} [states] - Other
 *   states than the fixture's, by file
 * @returns {(file: string) => import('./words.js').FileWords}
 */
export function wordsOf(states = {}) {
  const ready = { state: 'ready', words: wordsFromTranscript(TALK_SIDECAR), sidecar: TALK_SIDECAR };
  return (file) => {
    const state = states[file] || (file === TALK ? 'ready' : 'none');
    if (state === 'ready') return /** @type {any} */ (ready);
    return { state, words: [], sidecar: null };
  };
}
