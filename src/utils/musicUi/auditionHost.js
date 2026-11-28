/**
 * Where the audition sounds: the app's one AudioContext, through its
 * master gain — so the editor's volume and level meter apply to it too.
 * Starting sound needs a user gesture; `resume` is called from one, and
 * also stops the timeline, which would otherwise play on top. The device
 * is given back when nothing of the audition sounds any more. Tests put a
 * fake in its place.
 * @module utils/musicUi/auditionHost
 */

import { getAudioGraph, resumeAudio, suspendAudio } from '#utils/playback/audioGraph.js';
import { isPlaying, pause } from '#utils/playback/transport.js';

/**
 * @typedef {Object} AuditionHost
 * @property {() => AudioContext|null} context - null where there is no Web Audio
 * @property {() => AudioNode|null} output - What voices connect to
 * @property {() => Promise<void>} resume - Ask the context to run (from a user gesture)
 * @property {() => void} idle - Nothing of the audition sounds any more
 */

/** @type {AuditionHost} */
const APP_HOST = {
  context: () => getAudioGraph()?.ctx || null,
  output: () => getAudioGraph()?.master || null,
  resume() {
    if (isPlaying()) pause();
    return resumeAudio();
  },
  idle() {
    if (!isPlaying()) suspendAudio();
  },
};

let host = APP_HOST;
/** Things of the audition that sound now: the loop, and every single hit. */
let sounding = 0;

/** @returns {AuditionHost} */
export const auditionHost = () => host;

/**
 * Put another host in place (tests), or the app's own back.
 * @param {AuditionHost} [next]
 */
export function setAuditionHost(next = APP_HOST) {
  host = next;
  sounding = 0;
}

/** Something starts to sound. */
export function holdDevice() {
  sounding += 1;
}

/** Something stopped sounding; the last one gives the device back. */
export function releaseDevice() {
  sounding = Math.max(0, sounding - 1);
  if (!sounding) host.idle();
}
