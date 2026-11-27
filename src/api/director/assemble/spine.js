/**
 * The spine — picks laid end to end. Every pick becomes one or more cuts
 * placed one after another; that sequence sets the length of the edit.
 * Cutaways, music and titles are laid over it afterwards.
 * @module api/director/assemble/spine
 */

import { floorFrames, toFrames } from '#utils/director/snap.js';
import { wordRange } from '#utils/director/speech.js';
import { lengthOnBeat } from './beats.js';
import { imageClip, speechLabel } from './clips.js';
import { cutsForPick } from './cuts.js';
import { ambience, placeAv } from './place.js';

/**
 * @typedef {import('./cuts.js').Cut} Cut
 * @typedef {import('./fragment.js').Fragment} Fragment
 * @typedef {import('./options.js').AssembleOptions} AssembleOptions
 * @typedef {import('../plan/resolve.js').ResolvedPick} ResolvedPick
 * @typedef {{ startF: number, endF: number, cut: Cut, hasPicture: boolean }} Piece
 * @typedef {{ pick: ResolvedPick, startF: number, endF: number, pieces: Piece[] }} SpineItem
 */

/**
 * Place one cut of a pick on the spine.
 * @param {Fragment} fragment
 * @param {ResolvedPick} pick
 * @param {Cut} cut
 * @param {number} atF
 * @param {AssembleOptions} opts
 * @param {number} stillIndex
 * @returns {boolean} Whether the cut put picture on the main track
 */
function placeCut(fragment, pick, cut, atF, opts, stillIndex) {
  const { media } = cut;
  if (media.type === 'image') {
    fragment.add('main', imageClip(media, { atF, inF: 0, lenF: cut.lenF }, opts, stillIndex));
    return true;
  }
  if (pick.role === 'broll') {
    placeAv(fragment, cut, atF, {
      video: 'main',
      ...ambience(opts),
      intent: 'broll',
      label: media.filename,
    });
    return media.hasVideo;
  }
  const { fps } = opts;
  const label = speechLabel(media, cut.inF / fps, (cut.inF + cut.lenF) / fps);
  const showPicture = pick.role === 'primary' || !pick.visuals.length;
  placeAv(fragment, cut, atF, {
    video: showPicture ? 'main' : undefined,
    audio: 'dialogue',
    intent: cut.speech ? 'narration' : 'broll',
    label,
  });
  return showPicture && media.hasVideo;
}

/**
 * Lay the picks out one after another.
 * @param {Fragment} fragment
 * @param {ResolvedPick[]} picks
 * @param {AssembleOptions} opts
 * @param {number[]} beatsF - Beat grid in timeline frames ([] = no beat sync)
 * @param {ReturnType<import('./options.js').createStats>} stats
 * @returns {SpineItem[]}
 */
export function layoutSpine(fragment, picks, opts, beatsF, stats) {
  const { fps } = opts;
  const minF = Math.max(2, toFrames(0.6, fps));
  const items = [];
  let cursorF = 0;
  let stills = 0;
  for (const pick of picks) {
    /** @type {SpineItem} */
    const item = { pick, startF: cursorF, endF: cursorF, pieces: [] };
    for (const cut of cutsForPick(pick, opts, stats)) {
      if (!cut.speech && beatsF.length) {
        const still = cut.media.type === 'image';
        const lastF = cut.media.duration ? floorFrames(cut.media.duration, fps) : Infinity;
        const maxF = still ? cut.lenF * 2 : lastF - cut.inF;
        const onBeat = lengthOnBeat(cursorF, cut.lenF, beatsF, minF, maxF);
        if (beatsF.includes(cursorF + onBeat)) stats.beatCuts++;
        cut.lenF = onBeat;
      }
      const hasPicture = placeCut(fragment, pick, cut, cursorF, opts, stills);
      if (cut.media.type === 'image') stills++;
      item.pieces.push({ startF: cursorF, endF: cursorF + cut.lenF, cut, hasPicture });
      cursorF += cut.lenF;
    }
    item.endF = cursorF;
    if (item.pieces.length) items.push(item);
    else
      stats.notes.push(
        `Pick ${pick.index + 1}: nothing usable in ${pick.media.filename} — skipped.`,
      );
  }
  return items;
}

/**
 * The words spoken on the spine during a stretch of the timeline.
 * @param {SpineItem[]} items
 * @param {number} startF
 * @param {number} endF
 * @param {number} fps
 * @returns {string}
 */
export function spokenText(items, startF, endF, fps) {
  const out = [];
  for (const piece of items.flatMap((i) => i.pieces)) {
    if (!piece.cut.speech || piece.endF <= startF || piece.startF >= endF) continue;
    const from = piece.cut.inF + Math.max(startF, piece.startF) - piece.startF;
    const to = piece.cut.inF + Math.min(endF, piece.endF) - piece.startF;
    const words = piece.cut.media.words;
    const range = wordRange(words, from / fps, to / fps);
    if (range) out.push(...words.slice(range.first, range.last + 1).map((w) => w.word ?? ''));
  }
  return out.join(' ');
}
