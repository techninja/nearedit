/**
 * Runs — pieces of one voice that play on from each other. A clip that was
 * split still says the same sentence: its pieces touch on their track and
 * the second plays its file from where the first stopped. Captions treat
 * such pieces as one voice, so a cut changes nothing on screen — no group
 * breaks at it, no word is held back to it. Move, slip or trim a piece and
 * it is a voice of its own again.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Groups and timing.
 * @module utils/captions/runs
 */

/** @typedef {import('./voices.js').Voice} Voice */

/** Two times closer than this are the same moment, seconds. */
const SAME = 1e-6;

/** @type {WeakMap<object, { last: object, span: any }>} A run's span by its first piece */
const spans = new WeakMap();

/**
 * @param {Voice} a - The earlier voice
 * @param {Voice} b
 * @returns {boolean} True when `b` plays on from `a`: it starts where `a`
 *   ends, in the file and in time, and shows the same words
 */
function playsOn(a, b) {
  const [first, next] = [a.sound, b.sound];
  if (Math.abs(next.timelineStart - first.timelineEnd) > SAME) return false;
  const reached = first.sourceIn + (first.timelineEnd - first.timelineStart);
  if (Math.abs(next.sourceIn - reached) > SAME) return false;
  if (first.sourceFile !== next.sourceFile || a.clip.sourceFile !== b.clip.sourceFile) return false;
  return a.clip.captions?.words === b.clip.captions?.words;
}

/**
 * The stretch a run of pieces covers, as one sound clip: the first piece,
 * ending where the last one ends. The same object for the same first and
 * last piece, so what is worked out for a run is remembered from one
 * document to the next.
 * @param {Voice[]} run - In time order, at least two
 * @returns {any}
 */
function spanOf(run) {
  const first = run[0].sound;
  const last = run[run.length - 1].sound;
  const known = spans.get(first);
  if (known?.last === last) return known.span;
  const length = last.timelineEnd - first.timelineStart;
  const span = { ...first, timelineEnd: last.timelineEnd, sourceOut: first.sourceIn + length };
  spans.set(first, { last, span });
  return span;
}

/**
 * Join the voices that play on from each other into one voice each.
 * @param {Voice[]} voices - One per sounding clip
 * @returns {Voice[]} In the same order; a joined voice stands where its
 *   first piece stood, carries that piece's `clip`, sounds for the whole
 *   run (`sound`) and lists its clips in `pieces`
 */
export function joinRuns(voices) {
  /** @type {Map<any, Voice[]>} */
  const byTrack = new Map();
  for (const voice of voices) byTrack.set(voice.track, [...(byTrack.get(voice.track) || []), voice]);
  /** @type {Map<Voice, Voice[]>} Runs by their first voice */
  const runs = new Map();
  const joined = new Set();
  for (const lane of byTrack.values()) {
    lane.sort((a, b) => a.sound.timelineStart - b.sound.timelineStart);
    let run = [lane[0]];
    for (const voice of lane.slice(1)) {
      if (playsOn(run[run.length - 1], voice)) {
        run.push(voice);
        runs.set(run[0], run);
        joined.add(voice);
      } else run = [voice];
    }
  }
  if (!runs.size) return voices;
  return voices
    .filter((voice) => !joined.has(voice))
    .map((voice) => {
      const run = runs.get(voice);
      if (!run) return voice;
      return { ...voice, sound: spanOf(run), pieces: run.map((piece) => piece.sound) };
    });
}
