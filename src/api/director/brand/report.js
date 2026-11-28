/**
 * What a brand pass says it did: one line that counts, and a note for
 * everything it placed, kept, changed or took away — with where, and with
 * what it assumed.
 * @module api/director/brand/report
 */

import { CAPTION_PRESETS } from '#utils/captions/presets.js';
import { formatSeconds } from '#utils/director/snap.js';
import { kitName } from './kit.js';

/** @typedef {ReturnType<typeof import('#utils/director/brand/pass.js').brandPass>} Passed */

/** @param {number} seconds @returns {string} 0:04, 1:05 */
const clock = (seconds) => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** What a kind of thing is called when there are several: "2 lower thirds". */
const KINDS = [
  ['Intro', 'intro', 'intros'],
  ['Outro', 'outro', 'outros'],
  ['Logo bug', 'logo bug', 'logo bugs'],
  ['Lower third', 'lower third', 'lower thirds'],
  ['Chapter card', 'chapter card', 'chapter cards'],
  ['Stinger', 'stinger', 'stingers'],
];

/**
 * "intro, outro, 2 lower thirds and 1 stinger".
 * @param {{ what: string }[]} done
 * @returns {string}
 */
function counted(done) {
  const parts = [];
  let rest = done.length;
  for (const [starts, one, many] of KINDS) {
    const n = done.filter((entry) => entry.what.startsWith(starts)).length;
    rest -= n;
    if (n) parts.push(n === 1 ? one : `${n} ${many}`);
  }
  if (rest > 0) parts.push(rest === 1 ? '1 more element' : `${rest} more elements`);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
    : parts.join('');
}

/**
 * @param {Passed} passed
 * @param {import('#utils/brand/types.js').Kit} kit
 * @returns {{ summary: string, notes: string[] }}
 */
export function brandReport(passed, kit) {
  const { done } = passed;
  const by = (/** @type {string} */ state) => done.filter((entry) => entry.state === state);
  const [placed, kept, updated, removed] = ['placed', 'kept', 'updated', 'removed'].map(by);
  const style = passed.captions?.style;
  const preset = style ? CAPTION_PRESETS[style.preset]?.label || style.preset : '';
  const bits = [
    ...(placed.length ? [`placed ${counted(placed)}`] : []),
    ...(updated.length ? [`updated ${counted(updated)}`] : []),
    ...(removed.length ? [`removed ${counted(removed)}`] : []),
    ...(passed.captions?.changed ? [`caption style ${preset}`] : []),
    ...(passed.restyled
      ? [`${passed.restyled} clip${passed.restyled === 1 ? '' : 's'} brought up to date`]
      : []),
  ];
  const name = `Brand “${kitName(kit)}”`;
  let summary = `${name}: ${bits.join('; ')}`;
  if (!bits.length) {
    summary = kept.length
      ? `${name}: nothing to change — the timeline already carries it (${counted(kept)})`
      : `${name}: nothing to place`;
  }
  const line = (/** @type {string} */ verb) => (/** @type {any} */ entry) =>
    `${verb}: ${entry.what} at ${clock(entry.at)}${entry.why ? ` — ${entry.why}` : ''}.`;
  const notes = [
    ...placed.map(line('Placed')),
    ...updated.map(line('Updated')),
    ...removed.map(line('Removed')),
    ...(kept.length ? [`Already there, left as it is: ${counted(kept)}.`] : []),
  ];
  if (passed.opened) {
    notes.push(
      `Everything moved ${formatSeconds(passed.opened.by)} later to make room for the intro. ` +
        'Nothing else was moved or changed.',
    );
  }
  if (passed.captions?.changed) {
    const font = style.font?.family ? `, set in ${style.font.family}` : '';
    notes.push(`The timeline’s caption style is now the kit’s: ${preset}${font}.`);
  }
  if (passed.restyled) {
    notes.push(
      `${passed.restyled} element clip${passed.restyled === 1 ? ' was' : 's were'} out of date ` +
        'and now follow the kit; what was filled in, and where they sit, is unchanged.',
    );
  }
  if (passed.lockedStale) {
    notes.push(
      `${passed.lockedStale} element clip${passed.lockedStale === 1 ? '' : 's'} on locked ` +
        'tracks are out of date and were left alone.',
    );
  }
  if (passed.empty) notes.push('There is no picture on the timeline to dress yet.');
  return { summary, notes: [...notes, ...passed.notes] };
}
