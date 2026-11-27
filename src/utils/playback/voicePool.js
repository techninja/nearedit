/**
 * Voice pool — the mixer's `<audio>` voices, keyed by clip (so two clips of
 * one file each get their own) and recycled as clips come and go.
 * @module utils/playback/voicePool
 */

import { assignVoice, createVoice, disposeVoice, idleVoice } from '#utils/playback/audioVoice.js';

/** Idle voices kept loaded for reuse; the rest are torn down. */
const MAX_IDLE_VOICES = 4;

/**
 * @typedef {import('#utils/playback/audioVoice.js').Voice} Voice
 * @typedef {import('#utils/playback/audioGraph.js').AudioGraph} AudioGraph
 */

/**
 * Create a pool.
 * @returns {{
 *   acquire: (graph: AudioGraph, clipId: string, url: string) => Voice,
 *   retain: (clipIds: Set<string>, ctx: AudioContext) => void,
 *   all: () => Voice[],
 *   release: () => void,
 * }}
 */
export function createVoicePool() {
  /** @type {Voice[]} */
  let voices = [];

  return {
    /** The voice playing a clip: its own, an idle one (ideally holding the file) or a new one. */
    acquire(graph, clipId, url) {
      let voice = voices.find((v) => v.clipId === clipId);
      if (!voice) {
        voice = voices.find((v) => !v.clipId && v.url === url) || voices.find((v) => !v.clipId);
        if (!voice) voices.push((voice = createVoice(graph)));
      }
      if (voice.clipId !== clipId || voice.url !== url) assignVoice(voice, clipId, url);
      return voice;
    },

    /** Silence and free every voice whose clip is not in the set; drop the surplus. */
    retain(clipIds, ctx) {
      for (const voice of voices) {
        if (voice.clipId && !clipIds.has(voice.clipId)) idleVoice(voice, ctx);
      }
      const idle = voices.filter((v) => !v.clipId);
      for (const voice of idle.slice(MAX_IDLE_VOICES)) {
        disposeVoice(voice);
        voices = voices.filter((v) => v !== voice);
      }
    },

    all: () => voices,

    /** Free every element and node. */
    release() {
      for (const voice of voices) disposeVoice(voice);
      voices = [];
    },
  };
}
