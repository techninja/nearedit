/**
 * Fixtures for tests of the cutout's interface: a timeline with a person
 * over b-roll, the result a `cutout` job would give for a request, and a
 * stand-in for the server that answers when the test says so. Not part of
 * the runtime API — import it from tests.
 * @module utils/cutoutUi/testkit
 */

import { testClip, testEdl } from '#utils/edl/testkit.js';

/** @typedef {import('./needs.js').Need} Need */

/** The media file the person is in. */
export const SELFIE = '/media/selfie.mp4';

/**
 * A timeline: `me` (4…9 s of the selfie) and `me2` (20…23 s of it) on the
 * upper video track, b-roll below, the selfie's sound, and a still.
 * @returns {any}
 */
export function cutoutDoc() {
  return testEdl({
    v1: [
      testClip('me', 0, 5, { sourceFile: SELFIE, sourceIn: 4, sourceOut: 9 }),
      testClip('me2', 6, 9, { sourceFile: SELFIE, sourceIn: 20, sourceOut: 23 }),
      testClip('other', 10, 12, { sourceFile: '/media/guest.mp4' }),
    ],
    v2: [testClip('broll', 0, 9), testClip('photo', 9, 12, { sourceFile: '/media/photo.jpg' })],
    a1: [testClip('sound', 0, 5, { sourceFile: SELFIE })],
  });
}

/**
 * The result of a finished `cutout` job for a request.
 * @param {Pick<Need, 'path'|'start'|'end'|'fps'>} need
 * @param {Record<string, any>} [over]
 * @returns {any}
 */
export function madeFor(need, over = {}) {
  const frames = Math.round((need.end - need.start) * need.fps);
  const key = frames.toString(16).padStart(20, '0');
  return {
    ...{ file: `/p/.nearedit/cutout/${key}.mp4`, key, source: need.path },
    ...{ start: need.start, end: need.end, fps: need.fps },
    ...{ width: 1280, height: 720, frames, cached: false },
    ...over,
  };
}

/**
 * @typedef {Object} FakeCall - One request the lifecycle made
 * @property {Need} need
 * @property {AbortSignal} signal
 * @property {(patch: Record<string, any>) => void} progress - Report progress
 * @property {(over?: Record<string, any>) => void} finish - The job completes
 * @property {(message: string) => void} fail - The job fails
 */

/**
 * A server that takes requests and answers when told to. A request whose
 * signal fires is rejected with `Cancelled`, as the job client does.
 * @returns {{ calls: FakeCall[], open: () => FakeCall[],
 *   make: import('./flight.js').LifecycleDeps['make'] }} `open()`: the
 *   requests not answered yet
 */
export function fakeServer() {
  /** @type {FakeCall[]} */
  const calls = [];
  /** @type {Set<FakeCall>} */
  const pending = new Set();
  return {
    calls,
    open: () => [...pending],
    make: (need, { signal, onProgress }) =>
      new Promise((resolve, reject) => {
        /** @type {FakeCall} */
        const call = {
          need,
          signal,
          progress: (patch) => onProgress(patch),
          finish: (over) => settle(() => resolve(madeFor(need, over))),
          fail: (message) => settle(() => reject(new Error(message))),
        };
        /** @param {() => void} how */
        function settle(how) {
          pending.delete(call);
          how();
        }
        calls.push(call);
        pending.add(call);
        signal.addEventListener('abort', () => settle(() => reject(new Error('Cancelled'))));
      }),
  };
}
