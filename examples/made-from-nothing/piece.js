/**
 * "Made from nothing" — a 25 second piece with no footage and no images:
 * gradients, shapes, patterns, noise, particles and text, moved by
 * keyframes and finished with effects. Five scenes, each in its own file
 * under `scenes/`, written with the same operations the editor uses.
 * @module examples/made-from-nothing/piece
 */

import { createEdl, createTrack, normalizeEdl } from '#utils/edl/index.js';
import { stage } from './kit.js';
import { effects } from './scenes/effects.js';
import { endCard } from './scenes/endCard.js';
import { opening } from './scenes/opening.js';
import { particles } from './scenes/particles.js';
import { shapes } from './scenes/shapes.js';

/** Tracks, front-most first: [id, name]. */
const TRACKS = [
  ['title', 'Titles'],
  ['text', 'Captions'],
  ['fx', 'Particles'],
  ['s1', 'Shapes 1'],
  ['s2', 'Shapes 2'],
  ['s3', 'Shapes 3'],
  ['bgA', 'Background A'],
  ['bgB', 'Background B'],
];

/**
 * Give every clip an id that says where it is, so building twice writes
 * the same file.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @returns {import('#utils/edl/types.js').Edl}
 */
function nameClips(doc) {
  const tracks = doc.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip, i) => ({ ...clip, clipId: `${track.trackId}_${i + 1}` })),
  }));
  return { ...doc, tracks };
}

/**
 * Build the document.
 * @returns {import('#utils/edl/types.js').Edl}
 */
export function buildPiece() {
  const tracks = TRACKS.map(([trackId, name]) => createTrack('video', { trackId, name }));
  const s = stage(createEdl({ fps: 30, resolution: '1920x1080', tracks }));
  opening(s, 0);
  shapes(s, 5);
  particles(s, 10);
  effects(s, 15);
  endCard(s, 20);
  return normalizeEdl(nameClips(normalizeEdl(s.doc())));
}
