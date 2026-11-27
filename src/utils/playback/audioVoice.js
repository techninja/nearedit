/**
 * Audio voice — one `<audio>` element wired through its own gain node:
 *   element → MediaElementAudioSourceNode → GainNode → master
 * A voice plays one clip at a time; the mixer pools and reuses them.
 * @module utils/playback/audioVoice
 */

import { freshSync, unloadElement } from '#utils/playback/mediaSync.js';

/**
 * @typedef {Object} Voice
 * @property {HTMLAudioElement} el
 * @property {MediaElementAudioSourceNode} source
 * @property {GainNode} gain
 * @property {string} clipId - Clip being played, '' when idle
 * @property {string} url - Media loaded in the element
 * @property {string} signature - audioSignature the gain was scheduled for
 * @property {number} epoch - Mixer epoch the gain was scheduled in
 * @property {import('#utils/playback/mediaSync.js').SyncState} sync - Drift bookkeeping
 */

/**
 * Create a voice on the shared graph.
 * @param {import('#utils/playback/audioGraph.js').AudioGraph} graph
 * @returns {Voice}
 */
export function createVoice(graph) {
  const el = new Audio();
  el.preload = 'auto';
  // Rate nudges are plain resampling, not time-stretching: no artefacts.
  el.preservesPitch = false;
  const source = graph.ctx.createMediaElementSource(el);
  const gain = graph.ctx.createGain();
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(graph.master);
  return { el, source, gain, clipId: '', url: '', signature: '', epoch: -1, sync: freshSync() };
}

/**
 * Point a voice at a clip, loading new media only when the file changes.
 * @param {Voice} voice
 * @param {string} clipId
 * @param {string} url
 */
export function assignVoice(voice, clipId, url) {
  voice.clipId = clipId;
  voice.signature = '';
  voice.sync = freshSync();
  if (voice.url === url) return;
  voice.url = url;
  voice.el.src = url;
  voice.el.load();
}

/**
 * Schedule a voice's gain automation on the audio clock.
 * @param {Voice} voice
 * @param {import('#utils/playback/envelope.js').GainEvent[]} events - Timeline-time events
 * @param {number} position - Timeline seconds that correspond to "now"
 * @param {AudioContext} ctx
 */
export function scheduleGain(voice, events, position, ctx) {
  const param = voice.gain.gain;
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  for (const event of events) {
    const at = now + Math.max(0, event.time - position);
    if (event.type === 'ramp') param.linearRampToValueAtTime(event.value, at);
    else param.setValueAtTime(event.value, at);
  }
}

/**
 * Silence a voice and free it for another clip. Its media stays loaded so
 * the next clip from the same file starts without a fetch.
 * @param {Voice} voice
 * @param {AudioContext} ctx
 */
export function idleVoice(voice, ctx) {
  voice.el.pause();
  voice.gain.gain.cancelScheduledValues(ctx.currentTime);
  voice.gain.gain.setValueAtTime(0, ctx.currentTime);
  voice.clipId = '';
  voice.signature = '';
}

/**
 * Tear a voice down for good.
 * @param {Voice} voice
 */
export function disposeVoice(voice) {
  unloadElement(voice.el);
  voice.source.disconnect();
  voice.gain.disconnect();
  voice.clipId = '';
  voice.url = '';
}
