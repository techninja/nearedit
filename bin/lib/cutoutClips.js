/**
 * The person cutouts of a standalone document. Cutout files live beside the
 * document, in `.nearedit/cutout/`, as a project keeps them. Loading a
 * document gives every clip with cutout on the cutout it can use — the one
 * it remembers when that is still there and still covers it, otherwise one
 * found on disk that holds what the clip plays — and says which clips have
 * none: those are drawn with their background. Nothing is made here;
 * `nearedit cutout` makes what is missing (`cutoutCommand.js`).
 * Reference: docs/app-spec/CUTOUT.md § Command line.
 * @module bin/lib/cutoutClips
 */

import { existsSync } from 'node:fs';
import { indexClips } from '#utils/edl/immutable.js';
import { attachCutout, cutoutNeeds } from '#utils/edl/index.js';
import { findCutout, sourceOf } from '../../src/api/cutout/files.js';
import { settleCutouts } from '../../src/api/render/cutouts.js';

/** @typedef {import('./repairs.js').Finding} Finding */
/** @typedef {ReturnType<typeof cutoutNeeds>[number]} Uncut - A stretch of a media file still to cut out */

/**
 * @param {string} where - Where in a document a path stands
 * @returns {boolean} True for the cutout file a clip remembers: one that is
 *   not there is no error, the clip's cutout is then looked for on disk
 */
export const isCutoutFile = (where) => where.endsWith('.cutout.made.file');

/**
 * Give the clips of a document their cutouts.
 * @param {any} edl - Normalised, its media paths resolved
 * @param {string[]} folders - The document's folder, then the `--media` folders
 * @returns {{ edl: any, uncut: Uncut[] }} `uncut`: what no cutout on disk
 *   covers, one entry per media file
 */
export function attachCutouts(edl, folders) {
  // What a clip remembers but cannot use comes off first: gone, outgrown, another frame rate.
  let out = settleCutouts(edl, existsSync);
  const index = indexClips(out);
  for (const need of cutoutNeeds(out)) {
    const source = sourceOf(need.path);
    // What the clips play, without the margin a new cutout is given: any file that holds it will do.
    const clips = need.clips.map((id) => index.get(id).clip);
    const start = Math.min(...clips.map((clip) => clip.sourceIn));
    const end = Math.max(...clips.map((clip) => clip.sourceOut));
    const span = { start, end, fps: need.fps };
    const found = source && folders.map((at) => findCutout(at, source, span)).find(Boolean);
    if (found) out = attachCutout(out, found);
  }
  return { edl: out, uncut: cutoutNeeds(out) };
}

/**
 * Say which clips are drawn with their background because their cutout is
 * not made.
 * @param {any} edl - As `attachCutouts` returned it
 * @param {Uncut[]} uncut
 * @returns {Finding[]} Warnings
 */
export function uncutFindings(edl, uncut) {
  const waiting = new Set(uncut.flatMap((need) => need.waiting));
  /** @type {Finding[]} */
  const findings = [];
  edl.tracks.forEach((/** @type {any} */ track, /** @type {number} */ t) => {
    track.clips.forEach((/** @type {any} */ clip, /** @type {number} */ c) => {
      if (!waiting.has(clip.clipId)) return;
      const message =
        'person cutout not made yet: the clip is drawn with its background — ' +
        '"nearedit cutout" makes it';
      findings.push({ path: `tracks[${t}].clips[${c}].cutout`, level: 'warning', message });
    });
  });
  return findings;
}
