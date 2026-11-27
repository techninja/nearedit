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
import { getAudioGraph, peekAudioGraph } from '#utils/playback/audioGraph.js';
import { scheduleGain } from '#utils/playback/audioVoice.js';
import { AUDIO_DRIFT } from '#utils/playback/drift.js';
import { gainEvents, gainPoints } from '#utils/playback/envelope.js';
import { cueElement, driveElement } from '#utils/playback/mediaSync.js';
import { audioUrl } from '#utils/playback/mediaUrl.js';
import { audioCues, audioSignature } from '#utils/playback/schedule.js';
import { createVoicePool } from '#utils/playback/voicePool.js';

/** Seconds before a clip is due that its voice is loaded and parked. */
export const AUDIO_LOOKAHEAD = 1.5;

/** Seconds a voice runs, silent, before its clip is due (when the source allows). */
export const LEAD_IN = 0.15;

/**
 * Create a mixer.
 * @returns {{
 *   update: (tracks: any[], position: number, nowMs?: number) => void,
 *   park: (tracks: any[], position: number) => void,
 *   resync: () => void,
 *   pause: () => void,
 *   release: () => void,
 *   voices: () => import('#utils/playback/audioVoice.js').Voice[],
 * }}
 */
export function createMixer() {
  const pool = createVoicePool();
  let epoch = 0;
  let wasRunning = false;

  /** Stop all sound, keeping voices assigned so Play resumes instantly. */
  function pause() {
    for (const voice of pool.all()) if (!voice.el.paused) voice.el.pause();
  }

  /**
   * Playing: bring every voice in line with the document at a position.
   * Call every frame; edits to the document are picked up as they happen.
   * @param {any[]} tracks
   * @param {number} position - Timeline seconds on the master clock
   * @param {number} [nowMs] - Wall-clock milliseconds (injectable for tests)
   */
  function update(tracks, position, nowMs = performance.now()) {
    const graph = getAudioGraph();
    if (!graph) return;
    const running = graph.ctx.state === 'running';
    if (running !== wasRunning) epoch++;
    wasRunning = running;
    if (!running) return pause(); // no audio clock: stay silent, picture runs on
    const cues = audioCues(tracks, position, AUDIO_LOOKAHEAD);
    pool.retain(new Set(cues.map((cue) => cue.clip.clipId)), graph.ctx);
    for (const { clip, track } of cues) {
      const voice = pool.acquire(graph, clip.clipId, audioUrl(clip.sourceFile));
      const signature = audioSignature(track, clip);
      if (voice.signature !== signature || voice.epoch !== epoch) {
        scheduleGain(voice, gainEvents(gainPoints(track, clip), position), position, graph.ctx);
        voice.signature = signature;
        voice.epoch = epoch;
      }
      const lead = Math.min(LEAD_IN, clip.sourceIn);
      if (position < clip.timelineStart - lead) cueElement(voice.el, clip.sourceIn - lead);
      else driveElement(voice.el, voice.sync, sourceTimeAt(clip, position), AUDIO_DRIFT, nowMs);
    }
  }

  /**
   * Stopped: load and park the voices that Play would need at a position,
   * so playback starts without waiting for a seek. Does nothing unless
   * audio is up: no AudioContext before a user gesture, none after release.
   * @param {any[]} tracks
   * @param {number} position - Timeline seconds
   */
  function park(tracks, position) {
    const graph = peekAudioGraph();
    if (graph?.ctx.state !== 'running') return;
    const cues = audioCues(tracks, position, AUDIO_LOOKAHEAD);
    pool.retain(new Set(cues.map((cue) => cue.clip.clipId)), graph.ctx);
    for (const { clip, active } of cues) {
      const voice = pool.acquire(graph, clip.clipId, audioUrl(clip.sourceFile));
      const lead = Math.min(LEAD_IN, clip.sourceIn);
      cueElement(voice.el, active ? sourceTimeAt(clip, position) : clip.sourceIn - lead);
    }
  }

  return {
    update,
    park,
    pause,
    /** The clock jumped (play, seek, loop): re-schedule every gain. */
    resync: () => void epoch++,
    release: pool.release,
    voices: pool.all,
  };
}
