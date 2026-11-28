/**
 * Fixtures for tests of the music editor's controllers: a document with a
 * music clip, a small song, and the answer the server gives for a song.
 * Not part of the runtime API — import it from tests.
 * @module utils/musicUi/testkit
 */

import { insertMusicClip } from '#utils/edl/musicClip.js';
import { newClipIds } from '#utils/edl/selection.js';
import { testEdl } from '#utils/edl/testkit.js';
import { songKey, songSeconds } from '#utils/music/index.js';

/**
 * @returns {any} A two-bar song: a one-bar drum pattern and a bass line
 */
export function testSong() {
  return {
    bars: 2,
    parts: [
      { id: 'd', kind: 'drums', lanes: { kick: 'X...X...X...X...', hat: 'x.x.x.x.x.x.x.x.' } },
      {
        id: 's',
        kind: 'synth',
        preset: 'bass',
        bars: 2,
        notes: [
          [0, 1, 36, 0.9],
          [4, 1, 43, 0.8],
        ],
      },
    ],
  };
}

/**
 * A document with one music clip at the start of its audio track.
 * @param {any} [song]
 * @returns {{ doc: any, clipId: string }}
 */
export function musicDoc(song = testSong()) {
  const empty = testEdl();
  const doc = insertMusicClip(empty, song, { time: 0 });
  return { doc, clipId: newClipIds(empty, doc)[0] };
}

/**
 * What `POST /api/music/render` answers for a song.
 * @param {any} song
 * @returns {{ file: string, key: string, duration: number, cached: boolean }}
 */
export function renderingOf(song) {
  const key = songKey(song);
  return { file: `/p/.nearedit/music/${key}.wav`, key, duration: songSeconds(song), cached: false };
}

/** @returns {Promise<void>} Lets promises and zero-delay timers run */
export const turn = () => new Promise((resolve) => setTimeout(resolve, 5));
