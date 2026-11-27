/**
 * Placing picture with its linked sound, shared by the spine, cutaways and
 * auto b-roll.
 * @module api/director/assemble/place
 */

import { AMBIENCE_LEVEL } from '#utils/director/layout.js';
import { linkClips, mediaClip } from './clips.js';

/**
 * @typedef {import('./cuts.js').Cut} Cut
 * @typedef {import('./fragment.js').Fragment} Fragment
 * @typedef {import('./options.js').AssembleOptions} AssembleOptions
 */

/**
 * Place a video with (optionally) its linked sound.
 * @param {Fragment} fragment
 * @param {Cut} cut
 * @param {number} atF
 * @param {{ video?: import('./fragment.js').Slot, audio?: import('./fragment.js').Slot,
 *   volume?: number, intent: string, label: string }} where
 */
export function placeAv(fragment, cut, atF, where) {
  const place = { atF, inF: cut.inF, lenF: cut.lenF };
  const { fps } = fragment;
  const base = { intent: where.intent, label: where.label };
  const video =
    where.video && cut.media.hasVideo
      ? fragment.add(where.video, mediaClip(cut.media, place, fps, base))
      : null;
  const audio =
    where.audio && cut.media.hasAudio
      ? fragment.add(
          where.audio,
          mediaClip(cut.media, place, fps, { ...base, volume: where.volume ?? 1 }),
        )
      : null;
  if (video && audio) linkClips(video, audio);
}

/**
 * Where b-roll sound goes for the chosen natural-sound setting.
 * @param {AssembleOptions} opts
 * @returns {{ audio?: 'ambience', volume?: number }}
 */
export function ambience(opts) {
  if (opts.naturalSound === 'off') return {};
  return { audio: 'ambience', volume: opts.naturalSound === 'full' ? 1 : AMBIENCE_LEVEL };
}
