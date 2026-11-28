/**
 * What is wrong with a part of a song, whatever its kind: its mix, its
 * loop, where it plays — the checks behind `validateSong` for one entry of
 * `parts`. Isomorphic and pure.
 * @module utils/music/validatePart
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { own, toNumber } from '#utils/web/coerce.js';
import { SONG_LIMITS as LIMITS } from './limits.js';
import { partKind } from './normalizePart.js';
import { checkDrums, checkSynth, show } from './validateKinds.js';

/** @typedef {(path: string, message: string) => void} Report */

/**
 * A number that must lie in a range, when it is there at all.
 * @param {Record<string, any>} from
 * @param {string} name
 * @param {readonly number[]} range - `[min, max]`
 * @param {string} path - Of the object that holds it; '' for the song
 * @param {Report} report
 * @param {boolean} [whole]
 */
export function checkNumber(from, name, range, path, report, whole) {
  const value = own(from, name);
  if (value === undefined) return;
  const number = toNumber(value, NaN);
  const ok = number >= range[0] && number <= range[1] && (!whole || Number.isInteger(number));
  const kind = whole ? 'a whole number' : 'a number';
  if (!ok)
    report(
      path ? `${path}.${name}` : name,
      `${show(value)} must be ${kind} ${range[0]}..${range[1]}`,
    );
}

/**
 * @param {any} play - A part's `play`, as written
 * @param {string} path
 * @param {Report} report
 */
function checkPlay(play, path, report) {
  if (play === undefined) return;
  if (!Array.isArray(play))
    return report(path, 'must be a list of bar ranges, like [[0, 8], [12, 16]]');
  play.slice(0, LIMITS.ranges).forEach((range, i) => {
    const pair = Array.isArray(range) && range.length === 2 && range.every(Number.isInteger);
    if (!pair || !(range[0] >= 0 && range[1] > range[0])) {
      report(
        `${path}[${i}]`,
        `${show(range)} is not a bar range: [from, to] in whole bars, from < to`,
      );
    }
  });
}

/**
 * @param {any} raw - One entry of `parts`, as written
 * @param {string} path
 * @param {number} beatsPerBar
 * @param {Set<string>} ids - Ids of the parts before it
 * @param {Report} report
 */
export function checkPart(raw, path, beatsPerBar, ids, report) {
  if (!isPlainObject(raw))
    return report(path, 'must be an object like { "kind": "drums", "lanes": {} }');
  const kind = partKind(raw);
  const written = own(raw, 'kind');
  if (!kind || (written !== undefined && written !== kind)) {
    const what = written === undefined ? 'is required' : `${show(written)} is not a kind of part`;
    report(`${path}.kind`, `${what}: use "drums" or "synth"`);
  }
  const id = own(raw, 'id');
  if (typeof id === 'string' && id !== '' && ids.has(id))
    report(`${path}.id`, 'is used by another part');
  if (typeof id === 'string') ids.add(id);
  checkNumber(raw, 'volume', LIMITS.volume, path, report);
  checkNumber(raw, 'pan', LIMITS.pan, path, report);
  checkNumber(raw, 'reverb', LIMITS.send, path, report);
  checkNumber(raw, 'delay', LIMITS.send, path, report);
  checkNumber(raw, 'bars', LIMITS.bars, path, report, true);
  checkNumber(raw, 'transpose', LIMITS.transpose, path, report, true);
  checkPlay(own(raw, 'play'), `${path}.play`, report);
  if (kind === 'drums') checkDrums(raw, path, report);
  if (kind === 'synth') checkSynth(raw, path, beatsPerBar, report);
}
