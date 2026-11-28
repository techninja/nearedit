/**
 * Song validation: what the normaliser would quietly drop or change, said
 * to the person who wrote the song — every problem with the path of the
 * field it concerns. It reads the song as it was written. A song with
 * problems still plays: `normalizeSong` makes the best of it.
 * Isomorphic and pure.
 * @module utils/music/validate
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { own, toNumber } from '#utils/web/coerce.js';
import { SONG_LIMITS as LIMITS } from './limits.js';
import { KEY_NAMES, pitchClass } from './theory/names.js';
import { SCALES } from './theory/scales.js';
import { songFrame } from './timing.js';
import { show } from './validateKinds.js';
import { checkNumber, checkPart } from './validatePart.js';

/** @typedef {import('./types.js').Problem} Problem */
/** @typedef {(path: string, message: string) => void} Report */

/** Problems reported before the rest are left out. */
const MOST = 200;

/**
 * Validate a song.
 * @param {any} song - As written; it need not be normalised
 * @returns {{ valid: boolean, problems: Problem[] }} Paths look like `bpm`,
 *   `parts[1].lanes.kick`, `parts[2].notes[7]`
 */
export function validateSong(song) {
  /** @type {Problem[]} */
  const problems = [];
  const report = (path, message) =>
    void (problems.length < MOST && problems.push({ path, message }));
  const done = () => ({ valid: problems.length === 0, problems });
  if (!isPlainObject(song)) {
    report('', 'a song is an object like { "bpm": 120, "bars": 4, "parts": [] }');
    return done();
  }
  for (const name of ['bpm', 'swing', 'tail']) checkNumber(song, name, LIMITS[name], '', report);
  for (const name of ['beatsPerBar', 'bars'])
    checkNumber(song, name, LIMITS[name], '', report, true);
  const frame = songFrame(song);
  const wanted = toNumber(own(song, 'bars'), frame.bars);
  if (wanted <= LIMITS.bars[1] && wanted > frame.bars) {
    const minutes = LIMITS.seconds / 60;
    report(
      'bars',
      `${wanted} bars at this tempo last more than ${minutes} minutes; ${frame.bars} fit`,
    );
  }
  const key = own(song, 'key');
  if (key !== undefined && pitchClass(key) < 0) {
    report(
      'key',
      `${show(key)} is not a key: use a note name like ${KEY_NAMES.slice(0, 5).join(', ')}`,
    );
  }
  const scale = own(song, 'scale');
  if (scale !== undefined && !Object.hasOwn(SCALES, String(scale))) {
    report('scale', `${show(scale)} is not a scale: use one of ${Object.keys(SCALES).join(', ')}`);
  }
  const master = own(song, 'master');
  if (master !== undefined && !isPlainObject(master)) report('master', 'must be an object');
  const mix = isPlainObject(master) ? master : {};
  checkNumber(mix, 'volume', LIMITS.volume, 'master', report);
  const reverb = isPlainObject(own(mix, 'reverb')) ? mix.reverb : {};
  for (const name of ['size', 'decay']) checkNumber(reverb, name, [0, 1], 'master.reverb', report);
  const delay = isPlainObject(own(mix, 'delay')) ? mix.delay : {};
  checkNumber(delay, 'beats', LIMITS.delayBeats, 'master.delay', report);
  checkNumber(delay, 'feedback', LIMITS.feedback, 'master.delay', report);
  const parts = own(song, 'parts');
  if (parts !== undefined && !Array.isArray(parts)) report('parts', 'must be a list of parts');
  const list = Array.isArray(parts) ? parts : [];
  if (list.length > LIMITS.parts) {
    report('parts', `has ${list.length} parts; a song plays at most ${LIMITS.parts}`);
  }
  const ids = new Set();
  list.slice(0, LIMITS.parts).forEach((part, i) => {
    checkPart(part, `parts[${i}]`, frame.beatsPerBar, ids, report);
  });
  return done();
}
