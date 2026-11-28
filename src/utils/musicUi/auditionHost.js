/**
 * Where the audition sounds: the app's one AudioContext, through its
 * master gain — so the editor's volume and level meter apply to it too.
 * Starting sound needs a user gesture; `resume` is called from one, and
 * also stops the timeline, which would otherwise play on top. The app
 * keeps its context running between plays and lets the device go when the
 * editor closes, so there is nothing to give back here. Tests put a fake
 * in its place and count what sounds.
 * @module utils/musicUi/auditionHost
 */

import { getAudioGraph } from '#utils/playback/audioGraph.js';
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
    // Asked for whatever the state says: a suspension that is on its way
    // (the state still reads "running") is then followed by this.
    const resumed = getAudioGraph()?.ctx.resume() || Promise.resolve();
    return resumed.catch((err) => console.warn('[music] audio could not start:', err.message));
  },
  idle() {
    // The context is the app's own: it lets the device go when the editor closes.
  },
};

/** Milliseconds a context is given to start. */
export const START_MS = 1000;

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

/**
 * Ask for sound to start and say whether it did. Call from a user gesture.
 * A browser that will not let sound start leaves the question unanswered:
 * after `START_MS` the answer is no.
 * @returns {Promise<boolean>} True when the context is running
 */
export async function startDevice() {
  const ctx = host.context();
  if (!ctx) return false;
  await Promise.race([host.resume(), new Promise((resolve) => setTimeout(resolve, START_MS))]);
  return ctx.state === 'running';
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
