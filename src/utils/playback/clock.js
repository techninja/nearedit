/**
 * Master clock — maps a running time source to a timeline position.
 *
 * The audio hardware clock (`AudioContext.currentTime`) is the master
 * whenever it is running, so picture follows sound. If audio cannot start
 * (no device, blocked autoplay) the wall clock stands in, and the clock
 * re-bases itself without a jump when the audio clock comes or goes.
 * Time sources are injected, which keeps this pure and Node-testable.
 * @module utils/playback/clock
 */

/**
 * @typedef {Object} ClockSources
 * @property {() => number|null} audioNow - Audio clock seconds, null while it is not running
 * @property {() => number} wallNow - Monotonic wall-clock seconds
 */

/**
 * @typedef {Object} Clock
 * @property {(position: number) => void} start - Run from a timeline position
 * @property {() => number} stop - Halt and return the final position
 * @property {() => number} now - Current timeline position, seconds
 * @property {() => boolean} isRunning
 * @property {() => 'audio'|'wall'} source - The time source in charge
 */

/**
 * Create a clock.
 * @param {ClockSources} sources
 * @returns {Clock}
 */
export function createClock({ audioNow, wallNow }) {
  let running = false;
  let position = 0;
  let basePosition = 0;
  let baseAudio = 0;
  let baseWall = 0;
  /** @type {'audio'|'wall'} */
  let source = 'wall';

  /**
   * Restart both time bases from a position.
   * @param {number} from
   */
  function rebase(from) {
    const audio = audioNow();
    source = audio === null ? 'wall' : 'audio';
    basePosition = from;
    baseAudio = audio ?? 0;
    baseWall = wallNow();
  }

  /** @returns {number} */
  function now() {
    if (!running) return position;
    const audio = audioNow();
    const next = audio === null ? 'wall' : 'audio';
    if (next !== source) {
      // Audio arrived: carry on from where the wall clock has got to.
      // Audio went away: carry on from the last position it reported.
      rebase(source === 'wall' ? basePosition + (wallNow() - baseWall) : position);
    }
    const elapsed = source === 'audio' ? audio - baseAudio : wallNow() - baseWall;
    position = basePosition + Math.max(0, elapsed);
    return position;
  }

  return {
    start(from) {
      position = from;
      running = true;
      rebase(from);
    },
    stop() {
      position = now();
      running = false;
      return position;
    },
    now,
    isRunning: () => running,
    source: () => source,
  };
}
