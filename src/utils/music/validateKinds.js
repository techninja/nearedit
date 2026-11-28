/**
 * What is wrong with a part of a song, for the person who wrote it: the
 * checks behind `validateSong` that concern drum lanes and synth notes.
 * Isomorphic and pure.
 * @module utils/music/validateKinds
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { own, toNumber } from '#utils/web/coerce.js';
import { DRUM_NAMES } from './catalog/drums.js';
import { KITS } from './catalog/kits.js';
import { PRESETS } from './catalog/presets.js';
import { SYNTH_PARAMS } from './catalog/synthParams.js';
import { laneLength } from './lanes.js';
import { SONG_LIMITS as LIMITS, STEP_COUNTS } from './limits.js';
import { drumName } from './normalizeDrums.js';
import { noteFields, pitchOf } from './notes.js';
import { paramValue } from './params.js';

/** @typedef {(path: string, message: string) => void} Report */

/**
 * A value as its author wrote it, shortened — whatever it is: this never
 * throws, also for values JSON cannot write.
 * @param {any} value
 * @param {boolean} [inner] - Inside a list: lists and objects are not opened
 * @returns {string}
 */
export function show(value, inner = false) {
  if (typeof value === 'string') {
    return JSON.stringify(value.length > 60 ? `${value.slice(0, 59)}…` : value);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value)) {
    if (inner) return '[…]';
    const shown = value.slice(0, 5).map((entry) => show(entry, true));
    return `[${shown.join(', ')}${value.length > 5 ? ', …' : ''}]`;
  }
  return typeof value === 'object' ? '{…}' : `(${typeof value})`;
}

/**
 * @param {Record<string, any>} part - A drum part as written
 * @param {string} path
 * @param {Report} report
 */
export function checkDrums(part, path, report) {
  const kit = own(part, 'kit');
  if (kit !== undefined && !Object.hasOwn(KITS, String(kit))) {
    report(`${path}.kit`, `${show(kit)} is not a kit: use one of ${Object.keys(KITS).join(', ')}`);
  }
  const steps = own(part, 'steps');
  if (steps !== undefined && !STEP_COUNTS.includes(steps)) {
    report(`${path}.steps`, `${show(steps)} steps per bar: use one of ${STEP_COUNTS.join(', ')}`);
  }
  const lanes = own(part, 'lanes');
  if (lanes === undefined) return;
  if (!isPlainObject(lanes)) {
    return report(`${path}.lanes`, 'must be an object like { "kick": "X...x...X...x..." }');
  }
  const perBar = STEP_COUNTS.includes(steps) ? steps : 16;
  const bars = toNumber(own(part, 'bars'), NaN);
  for (const [name, lane] of Object.entries(lanes).slice(0, 100)) {
    const at = `${path}.lanes.${name}`;
    if (!drumName(name)) {
      report(at, `is not a drum of a kit: use one of ${DRUM_NAMES.join(', ')}`);
    } else if (typeof lane !== 'string') {
      report(at, 'must be a string with one character per step: . o x or X');
    } else if (/[^.oxX\s|]/.test(lane)) {
      report(at, `${show(lane)} has characters other than . (rest) o (soft) x (hit) X (accent)`);
    } else if (bars >= 1 && laneLength(lane) > perBar * Math.round(bars)) {
      const room = perBar * Math.round(bars);
      report(at, `has ${laneLength(lane)} steps; the part's loop has ${room}, the rest is cut`);
    }
  }
}

/**
 * @param {any} raw - One entry of `notes`, as written
 * @param {number} loop - Beats of the part's loop; NaN when it does not say
 * @returns {string} What is wrong with it; '' when nothing is
 */
function noteProblem(raw, loop) {
  const fields = noteFields(raw);
  if (!fields) return 'must be [beat, length, pitch, velocity], like [0, 0.5, 60, 0.8]';
  const [beat, length, pitch, velocity] = fields;
  if (!(toNumber(beat, NaN) >= 0)) return `${show(beat)} is not a beat: a number, 0 or more`;
  if (toNumber(beat, 0) >= loop) {
    return `starts at beat ${show(beat)}, after the end of the part's loop of ${loop} beats`;
  }
  const note = pitchOf(pitch);
  if (!(note >= LIMITS.pitch[0] && note <= LIMITS.pitch[1])) {
    return `${show(pitch)} is not a pitch: a MIDI note number 0..127 (60 = middle C) or a name like "C4"`;
  }
  if (length !== undefined && !(toNumber(length, NaN) > 0)) {
    return `${show(length)} is not a length: beats, more than 0`;
  }
  const loud = toNumber(velocity, NaN);
  if (velocity !== undefined && !(loud > 0 && loud <= 1)) {
    return `${show(velocity)} is not a velocity: more than 0, at most 1`;
  }
  return '';
}

/**
 * @param {Record<string, any>} part - A synth part as written
 * @param {string} path
 * @param {number} beatsPerBar
 * @param {Report} report
 */
export function checkSynth(part, path, beatsPerBar, report) {
  const preset = own(part, 'preset');
  if (preset !== undefined && !Object.hasOwn(PRESETS, String(preset))) {
    const names = Object.keys(PRESETS).join(', ');
    report(`${path}.preset`, `${show(preset)} is not a preset: use one of ${names}`);
  }
  const params = own(part, 'params');
  if (params !== undefined && !isPlainObject(params)) report(`${path}.params`, 'must be an object');
  for (const [name, value] of Object.entries(isPlainObject(params) ? params : {}).slice(0, 100)) {
    const spec = Object.hasOwn(SYNTH_PARAMS, name) ? SYNTH_PARAMS[name] : null;
    const at = `${path}.params.${name}`;
    if (!spec) report(at, 'is not a parameter of the synth (see SYNTH_PARAMS)');
    else if (spec.type === 'select' && !spec.options.includes(value)) {
      report(at, `${show(value)} is not one of ${spec.options.join(', ')}`);
    } else if (spec.type === 'number' && paramValue(name, value, NaN) !== value) {
      report(at, `${show(value)} must be a number ${spec.min}..${spec.max}`);
    }
  }
  const notes = own(part, 'notes');
  if (notes === undefined) return;
  if (!Array.isArray(notes)) {
    return report(`${path}.notes`, 'must be a list of [beat, length, pitch, velocity]');
  }
  if (notes.length > LIMITS.notes) {
    report(`${path}.notes`, `has ${notes.length} notes; a part plays at most ${LIMITS.notes}`);
  }
  const bars = toNumber(own(part, 'bars'), NaN);
  notes.slice(0, LIMITS.notes).forEach((note, i) => {
    const problem = noteProblem(note, Math.round(bars) * beatsPerBar);
    if (problem) report(`${path}.notes[${i}]`, problem);
  });
}
