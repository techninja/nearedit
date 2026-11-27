/**
 * Assembly: resolved plan → fragment. The plan says what to use; this is
 * where all the timing happens — word, shot and beat alignment, frame
 * snapping, linked picture/sound pairs, the track layout.
 * Reference: docs/app-spec/DIRECTOR.md § Assembly.
 * @module api/director/assemble
 */

import { formatSeconds } from '#utils/director/snap.js';
import { DirectorError } from '../errors.js';
import { autoBroll } from './autoBroll.js';
import { beatFrames } from './beats.js';
import { addMusic, addTitles, pickMarkers } from './finish.js';
import { createFragment } from './fragment.js';
import { createStats } from './options.js';
import { layoutSpine } from './spine.js';
import { layoutVisuals } from './visuals.js';

/**
 * @typedef {import('./options.js').AssembleOptions} AssembleOptions
 * @typedef {import('../plan/resolve.js').ResolvedPlan} ResolvedPlan
 * @typedef {Object} Assembled
 * @property {{ type: string, index: number, name: string, clips: any[] }[]} tracks
 * @property {object[]} markers
 * @property {string} summary
 * @property {string[]} notes
 * @property {number} seconds - Length of the fragment
 */

/**
 * Count clips the way an editor would: a linked picture/sound pair is one.
 * @param {{ type: string, clips: any[] }[]} tracks
 * @returns {number}
 */
export function countClips(tracks) {
  return tracks.reduce(
    (sum, t) => sum + t.clips.filter((c) => t.type === 'video' || !c.linkedClipId).length,
    0,
  );
}

/**
 * What the timing passes did, as notes for the user.
 * @param {ReturnType<typeof createStats>} stats
 * @param {ResolvedPlan} plan
 * @param {AssembleOptions} opts
 * @param {number[]} beatsF
 * @returns {string[]}
 */
function timingNotes(stats, plan, opts, beatsF) {
  const notes = [];
  const s = (/** @type {number} */ n) => (n === 1 ? '' : 's');
  if (stats.wordAligned)
    notes.push(
      `${stats.wordAligned} speech pick${s(stats.wordAligned)} aligned to word boundaries.`,
    );
  if (stats.segmentOnly)
    notes.push(
      `${stats.segmentOnly} pick${s(stats.segmentOnly)} had no word timestamps; cut on segment or silence boundaries.`,
    );
  if (stats.pausesRemoved)
    notes.push(
      `Removed ${stats.pausesRemoved} pause${s(stats.pausesRemoved)} ` +
        `(${formatSeconds(stats.secondsRemoved)} of dead air) from the speech.`,
    );
  if (stats.sceneSnapped)
    notes.push(
      `${stats.sceneSnapped} picture cut${s(stats.sceneSnapped)} moved onto shot boundaries.`,
    );
  if (stats.autoBroll)
    notes.push(`Auto b-roll: ${stats.autoBroll} shot${s(stats.autoBroll)} added over the speech.`);
  if (plan.music && opts.beatSync && !beatsF.length)
    notes.push(`${plan.music.media.filename} has no beat analysis — cuts were not beat-synced.`);
  else if (stats.beatCuts)
    notes.push(`${stats.beatCuts} cut${s(stats.beatCuts)} land on the beat.`);
  return notes;
}

/**
 * Assemble a resolved plan.
 * @param {ResolvedPlan} plan
 * @param {AssembleOptions} opts
 * @returns {Assembled}
 * @throws {DirectorError} 422 when nothing in the plan is usable
 */
export function assemblePlan(plan, opts) {
  const stats = createStats();
  const fragment = createFragment(opts.fps);
  const beatsF = opts.beatSync ? beatFrames(plan.music, opts.fps, opts.beatEvery) : [];
  const items = layoutSpine(fragment, plan.picks, opts, beatsF, stats);
  if (!items.length)
    throw new DirectorError('Nothing could be assembled from the plan', {
      status: 422,
      detail: [...plan.notes, ...stats.notes].join(' '),
    });
  for (const item of items)
    if (item.pick.visuals.length) layoutVisuals(fragment, item, opts, beatsF, stats);
  if (opts.autoBroll) autoBroll(fragment, items, opts, beatsF, stats);
  addMusic(fragment, plan.music, opts, stats.notes);
  addTitles(fragment, plan.title, items, opts, stats.notes);

  const tracks = fragment.toTracks();
  const seconds = fragment.endF() / opts.fps;
  const bits = [`${countClips(tracks)} clips`, formatSeconds(seconds)];
  if (plan.music) {
    const bpm = plan.music.media.bpm ? ` at ${Math.round(plan.music.media.bpm)} BPM` : '';
    bits.push(stats.beatCuts ? `cut on the beat${bpm}` : `music bed${bpm}`);
  }
  const titles = fragment.slots.titles.length;
  if (titles) bits.push(titles === 1 ? '1 title' : `${titles} titles`);
  return {
    tracks,
    markers: pickMarkers(items, opts.fps),
    summary: bits.join(', '),
    notes: [...plan.notes, ...stats.notes, ...timingNotes(stats, plan, opts, beatsF)],
    seconds,
  };
}
