/**
 * Fixtures for transcript tests: synthetic speech with known pauses, and a
 * timeline that plays it as a linked picture/sound pair. Not part of the
 * runtime — import it from tests.
 * @module utils/transcript/testkit
 */

import { createClip } from '#utils/edl/factory.js';
import { testEdl } from '#utils/edl/testkit.js';

export const TALK = '/media/talk.mp4';

/**
 * Words of `sentences`, spoken at a steady pace with a pause after each.
 * Every word lasts 0.3 s and is followed by a 0.05 s gap.
 * @param {string[]} sentences
 * @param {number[]} pauses - Seconds of silence after each sentence
 * @param {number} [lead=0.5] - Silence before the first word
 * @returns {{ transcript: { word: string, start: number, end: number }[],
 *   segments: { id: number, start: number, end: number, text: string }[],
 *   duration: number }}
 */
export function speech(sentences, pauses, lead = 0.5) {
  const round = (/** @type {number} */ t) => Math.round(t * 1000) / 1000;
  const transcript = [];
  const segments = [];
  let t = lead;
  sentences.forEach((text, id) => {
    const start = t;
    for (const word of text.split(' ')) {
      transcript.push({ word, start: round(t), end: round(t + 0.3) });
      t += 0.35;
    }
    segments.push({ id, start: round(start), end: round(t - 0.05), text });
    t += pauses[id] - 0.05;
  });
  return { transcript, segments, duration: round(t) };
}

/** Five sentences; the pauses after the 2nd and 4th are long ones. */
export const TALK_SIDECAR = speech(
  [
    'Welcome to the park.',
    'It runs in the browser.',
    'First we look at trees.',
    'The dog found a stick.',
    'Thanks for watching.',
  ],
  [0.6, 1.4, 0.5, 2.0, 0.4],
);

/**
 * A timeline that plays a source as linked picture (`v`, track v1) and
 * sound (`a`, track a1) from `at`, followed by a later clip on v1, with a
 * music bed on a2 and one marker after the talk.
 * @param {{ at?: number, sourceIn?: number, sourceOut?: number, fps?: number }} [opts]
 * @returns {import('#utils/edl/types.js').Edl}
 */
export function talkEdl(opts = {}) {
  const { at = 2, sourceIn = 0, sourceOut = 15, fps = 30 } = opts;
  const length = sourceOut - sourceIn;
  const pair = (/** @type {string} */ clipId, /** @type {string} */ linkedClipId) =>
    createClip({
      clipId,
      linkedClipId,
      sourceFile: TALK,
      sourceIn,
      sourceOut,
      timelineStart: at,
      timelineEnd: at + length,
    });
  const later = createClip({
    clipId: 'later',
    sourceFile: '/media/broll.mp4',
    sourceOut: 4,
    timelineStart: at + length,
    timelineEnd: at + length + 4,
  });
  const music = createClip({
    clipId: 'music',
    sourceFile: '/media/song.mp3',
    sourceOut: 40,
    timelineStart: 0,
    timelineEnd: 40,
  });
  return testEdl(
    { v1: [pair('v', 'a'), later], a1: [pair('a', 'v')], a2: [music] },
    { fps, markers: [{ markerId: 'm1', time: at + length + 1, label: 'After', color: '' }] },
  );
}

/**
 * The pieces of a source on one track, as comparable rows.
 * @param {import('#utils/edl/types.js').Edl} edl
 * @param {string} trackId
 * @param {string} [file]
 * @returns {{ id: string, link: string, span: string, source: string }[]}
 */
export function pieces(edl, trackId, file = TALK) {
  const fixed = (/** @type {number} */ n) => n.toFixed(4);
  return edl.tracks
    .find((track) => track.trackId === trackId)
    .clips.filter((clip) => clip.sourceFile === file)
    .map((clip) => ({
      id: clip.clipId,
      link: clip.linkedClipId,
      span: `${fixed(clip.timelineStart)}-${fixed(clip.timelineEnd)}`,
      source: `${fixed(clip.sourceIn)}-${fixed(clip.sourceOut)}`,
    }));
}
