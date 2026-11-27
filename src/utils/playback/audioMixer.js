/**
 * Audio mixer — plays every audible audio clip of the timeline at once.
 *
 * Mechanism: pooled `<audio>` elements, one per sounding clip, each routed
 * through its own gain node into the master gain (see audioVoice.js).
 * Chosen over decoded AudioBuffers because timelines here are built from
 * long sources — phone footage, hour-long recordings, music beds — and an
 * audio clip is often the sound of a multi-gigabyte video file. Elements
 * stream with HTTP range requests and hold seconds in memory; a decoded
 * buffer needs the whole file downloaded and ~690 MB per stereo hour.
 *
 * What buffers would give for free is recovered like this:
 * - Timing. Level is automated on the AudioContext clock (the transport's
 *   master), so clip starts, ends and fades are sample-accurate even though
 *   an element starts a few ms late. A clip is cued ahead of time, started
 *   `LEAD_IN` early with its gain closed, and the gain opens on the cue.
 * - Sync. Every frame each element is compared with the clock and
 *   corrected (mediaSync.js): rate nudge above 15 ms, re-seek above 100 ms.
 * - Seeking. Compressed audio plays from the server's WAV rendition
 *   (mediaUrl.js), whose seeks are exact.
 * - Same file twice. Voices are keyed by clip, not by file, so two clips of
 *   one source sound together.
 * Not recovered: a loop wrap or a seek during play re-seeks the elements,
 * which is a few ms of silence rather than a sample-accurate splice.
 *
 * @module utils/playback/audioMixer
 */

import { sourceTimeAt } from '#utils/edl/query.js';
import { getAudioGraph } from '#utils/playback/audioGraph.js';
import { assignVoice, createVoice, disposeVoice, idleVoice } from '#utils/playback/audioVoice.js';
import { scheduleGain } from '#utils/playback/audioVoice.js';
import { AUDIO_DRIFT } from '#utils/playback/drift.js';
import { gainEvents, gainPoints } from '#utils/playback/envelope.js';
import { cueElement, driveElement } from '#utils/playback/mediaSync.js';
import { audioUrl } from '#utils/playback/mediaUrl.js';
import { audioCues, audioSignature } from '#utils/playback/schedule.js';

/** Seconds before a clip is due that its voice is loaded and parked. */
export const AUDIO_LOOKAHEAD = 1.5;

/** Seconds a voice runs, silent, before its clip is due (when the source allows). */
export const LEAD_IN = 0.15;

/** Idle voices kept loaded for reuse; the rest are torn down. */
const MAX_IDLE_VOICES = 4;

/**
 * @typedef {import('#utils/playback/audioVoice.js').Voice} Voice
 */

/**
 * Create a mixer. `update` is called every frame while playing.
 * @returns {{
 *   update: (tracks: any[], position: number) => void,
 *   resync: () => void,
 *   pause: () => void,
 *   release: () => void,
 *   voices: () => Voice[],
 * }}
 */
export function createMixer() {
  /** @type {Voice[]} */
  let voices = [];
  let epoch = 0;
  let wasRunning = false;

  /**
   * The voice playing a clip, taking an idle one (ideally already holding
   * the same file) or creating one.
   * @param {import('#utils/playback/audioGraph.js').AudioGraph} graph
   * @param {string} clipId
   * @param {string} url
   * @returns {Voice}
   */
  function voiceFor(graph, clipId, url) {
    let voice = voices.find((v) => v.clipId === clipId);
    if (!voice) {
      voice = voices.find((v) => !v.clipId && v.url === url) || voices.find((v) => !v.clipId);
      if (!voice) voices.push((voice = createVoice(graph)));
    }
    if (voice.clipId !== clipId || voice.url !== url) assignVoice(voice, clipId, url);
    return voice;
  }

  /** Tear down idle voices beyond the pool size. */
  function trimIdle() {
    const idle = voices.filter((v) => !v.clipId);
    for (const voice of idle.slice(MAX_IDLE_VOICES)) {
      disposeVoice(voice);
      voices = voices.filter((v) => v !== voice);
    }
  }

  /**
   * Bring every voice in line with the document at a timeline position.
   * @param {any[]} tracks
   * @param {number} position - Timeline seconds on the master clock
   */
  function update(tracks, position) {
    const graph = getAudioGraph();
    if (!graph) return;
    const running = graph.ctx.state === 'running';
    if (running !== wasRunning) epoch++;
    wasRunning = running;
    if (!running) return pause(); // no audio clock: stay silent, picture runs on
    const cues = audioCues(tracks, position, AUDIO_LOOKAHEAD);
    const wanted = new Set(cues.map((cue) => cue.clip.clipId));
    for (const voice of voices) {
      if (voice.clipId && !wanted.has(voice.clipId)) idleVoice(voice, graph.ctx);
    }
    const nowMs = performance.now();
    for (const { clip, track } of cues) {
      const voice = voiceFor(graph, clip.clipId, audioUrl(clip.sourceFile));
      const signature = audioSignature(track, clip);
      if (voice.signature !== signature || voice.epoch !== epoch) {
        scheduleGain(voice, gainEvents(gainPoints(track, clip), position), position, graph.ctx);
        if (voice.epoch !== epoch) voice.seekAt = 0;
        voice.signature = signature;
        voice.epoch = epoch;
      }
      const lead = Math.min(LEAD_IN, clip.sourceIn);
      if (position < clip.timelineStart - lead) cueElement(voice.el, clip.sourceIn - lead);
      else driveElement(voice.el, voice, sourceTimeAt(clip, position), AUDIO_DRIFT, nowMs);
    }
    trimIdle();
  }

  /** Stop all sound, keeping voices assigned so Play resumes instantly. */
  function pause() {
    for (const voice of voices) if (!voice.el.paused) voice.el.pause();
  }

  return {
    update,
    pause,
    /** The clock jumped (play, seek, loop): re-schedule every gain. */
    resync: () => void epoch++,
    /** Free every element and node. */
    release() {
      for (const voice of voices) disposeVoice(voice);
      voices = [];
    },
    voices: () => voices,
  };
}
