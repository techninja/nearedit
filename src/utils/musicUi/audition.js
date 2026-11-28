/**
 * Hearing a song while it is edited. The engine itself plays in the page:
 * the song is rendered a slice at a time (`auditionRender.js`) into one
 * buffer — the very samples the server will write to the clip's file — and
 * looped over the chosen bars (`loopPlayer.js`). After an edit the song is
 * rendered again and the new buffer takes over at the next bar line. One
 * thing plays at a time: the music editor, or a tile of the Create tab.
 * @module utils/musicUi/audition
 */

import { onFrame } from '#utils/playback/transport.js';
import { createObservable } from '#utils/ui/observable.js';
import { auditionHost, holdDevice, releaseDevice, startDevice } from './auditionHost.js';
import { createTakes } from './auditionTakes.js';
import { createLoopPlayer } from './loopPlayer.js';

/** @typedef {import('./loopVoices.js').Take} Take */

/**
 * @typedef {Object} AuditionState
 * @property {string} owner - Who plays: `editor`, `starter:<id>`…; '' = nobody
 * @property {boolean} playing - The owner asked for sound (it may still be on its way)
 * @property {boolean} rendering - A song is being rendered
 * @property {string} problem - Why nothing sounds; '' when all is well
 */

/** Milliseconds an edited song waits before it is rendered, so a drag renders once. */
const SETTLE_MS = 60;
const BLOCKED = 'The browser has not let sound start yet — press Play again';

/** @type {import('#utils/ui/observable.js').Observable<AuditionState>} */
export const auditionState = createObservable({
  ...{ owner: '', playing: false, rendering: false, problem: '' },
});
/** @type {{ ctx: any, player: ReturnType<typeof createLoopPlayer>, takes: ReturnType<typeof createTakes> }|null} */
let rig = null;
/** @type {{ song: any, loop: number[] }|null} What the owner wants to hear */
let wanted = null;
/** @type {any} */
let timer = 0;

/** @param {any} ctx @returns {NonNullable<typeof rig>} The player and its buffers, for this context */
function rigFor(ctx) {
  if (rig?.ctx !== ctx) {
    const takes = createTakes(ctx, (rendering) => auditionState.set({ rendering }));
    rig = { ctx, player: createLoopPlayer(ctx, auditionHost().output()), takes };
  }
  return rig;
}

/** Bring what sounds in line with what is wanted. */
async function refresh() {
  const ask = wanted;
  const ctx = auditionHost().context();
  if (!ask || !ctx) return;
  const { player, takes } = rigFor(ctx);
  const take = await takes.take(ask.song);
  if (!take || wanted !== ask || !auditionState.get().playing) return;
  if (player.playing()) player.replan(take, ask.loop);
  else player.start(take, ask.loop);
}

/**
 * Stop the audition.
 * @param {string} [owner] - Only when this one plays; left out: whoever plays
 */
export function stopAudition(owner) {
  const state = auditionState.get();
  if (!state.owner || (owner !== undefined && owner !== state.owner)) return;
  clearTimeout(timer);
  wanted = null;
  rig?.takes.cancel();
  rig?.player.stop();
  auditionState.set({ owner: '', playing: false, rendering: false, problem: '' });
  releaseDevice();
}

/**
 * Play a song in a loop. Call from a user gesture: browsers let sound
 * start only then.
 * @param {string} owner
 * @param {any} song - Normalised; the same object is not rendered twice
 * @param {number[]} loop - `[from, to)` in bars
 * @returns {Promise<boolean>} false when sound could not start (`problem` says why)
 */
export async function playSong(owner, song, loop) {
  const ctx = auditionHost().context();
  stopAudition();
  if (!ctx) {
    auditionState.set({ problem: 'This browser cannot play sound' });
    return false;
  }
  auditionState.set({ owner, playing: true, problem: '' });
  holdDevice();
  wanted = { song, loop };
  const started = await startDevice();
  if (auditionState.get().owner !== owner) return false;
  if (!started) {
    stopAudition(owner);
    auditionState.set({ problem: BLOCKED });
    return false;
  }
  await refresh();
  return auditionState.get().owner === owner;
}

/**
 * The owner's song or its loop changed: what plays follows at the next bar.
 * @param {string} owner
 * @param {any} song
 * @param {number[]} loop
 */
export function updateAudition(owner, song, loop) {
  const state = auditionState.get();
  if (state.owner !== owner || !state.playing || !wanted) return;
  const same = wanted.song === song;
  if (same && wanted.loop.join() === loop.join()) return;
  wanted = { song, loop };
  clearTimeout(timer);
  if (same || rig?.takes.peek(song)) refresh();
  else timer = setTimeout(refresh, SETTLE_MS);
}

// The timeline and the audition never sound together: when the timeline
// starts to play (its first frame), whatever the audition plays stops.
onFrame(() => stopAudition());

/**
 * @returns {{ time: number, bar: number }|null} Where the music is: seconds
 *   into the song and (fractional) bars; null while nothing sounds
 */
export const auditionPosition = () => rig?.player.position() || null;

/** @returns {Take|null} The buffer that is wanted now, once it is rendered (for measuring) */
export const auditionTake = () => (wanted && rig?.takes.peek(wanted.song)) || null;
