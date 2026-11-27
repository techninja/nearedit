/**
 * Visuals — the pictures a plan lays over a pick (cutaways). They share
 * the pick's time evenly, cut on the beat when there is one, and go on the
 * B-roll track above the main picture.
 * @module api/director/assemble/visuals
 */

import { toFrames } from '#utils/director/snap.js';
import { lengthOnBeat } from './beats.js';
import { imageClip } from './clips.js';
import { pictureCut } from './cuts.js';
import { ambience, placeAv } from './place.js';

/**
 * @typedef {import('./fragment.js').Fragment} Fragment
 * @typedef {import('./options.js').AssembleOptions} AssembleOptions
 * @typedef {ReturnType<import('./options.js').createStats>} Stats
 */

/**
 * Put one piece of b-roll on the B-roll track.
 * @param {Fragment} fragment
 * @param {import('../plan/parts.js').ResolvedPart} part
 * @param {number} atF
 * @param {number} wantF - Frames to fill
 * @param {AssembleOptions} opts
 * @param {Stats} stats
 * @returns {number} Frames actually covered (less than `wantF` for a short source)
 */
export function placeBroll(fragment, part, atF, wantF, opts, stats) {
  const { media } = part;
  if (media.type === 'image') {
    const index = fragment.slots.broll.length + fragment.slots.main.length;
    stats.uses.set(media.filePath, (stats.uses.get(media.filePath) || 0) + 1);
    fragment.add('broll', imageClip(media, { atF, inF: 0, lenF: wantF }, opts, index));
    return wantF;
  }
  const cut = pictureCut(
    media,
    { ...part, end: null, duration: null },
    wantF / opts.fps,
    opts,
    stats,
  );
  if (!cut) return 0;
  cut.lenF = Math.min(cut.lenF, wantF);
  placeAv(fragment, cut, atF, {
    video: 'broll',
    ...ambience(opts),
    intent: 'broll',
    label: media.filename,
  });
  return cut.lenF;
}

/**
 * Lay a pick's visuals over its stretch of the spine.
 * @param {Fragment} fragment
 * @param {import('./spine.js').SpineItem} item
 * @param {AssembleOptions} opts
 * @param {number[]} beatsF
 * @param {Stats} stats
 */
export function layoutVisuals(fragment, item, opts, beatsF, stats) {
  const visuals = item.pick.visuals;
  const minF = Math.max(2, toFrames(0.8, opts.fps));
  let cursorF = item.startF;
  visuals.forEach((part, k) => {
    const left = item.endF - cursorF;
    const after = visuals.length - k - 1;
    if (left < 2) return;
    let wantF = after ? Math.round(left / (after + 1)) : left;
    if (after && beatsF.length) {
      const onBeat = lengthOnBeat(cursorF, wantF, beatsF, minF, left - minF * after);
      if (beatsF.includes(cursorF + onBeat)) stats.beatCuts++;
      wantF = onBeat;
    }
    cursorF += placeBroll(fragment, part, cursorF, wantF, opts, stats);
  });
}
