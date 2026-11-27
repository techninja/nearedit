/**
 * The background clip of a scene of a motion piece: a background recipe,
 * the scene's look, and the transitions in which this clip is the layer in
 * front.
 * @module api/director/motion/backdrop
 */

import { hash } from '#utils/compose/random.js';
import { background } from './backgrounds.js';
import { clipAt, keyframes, paramKeys } from './clips.js';
import { changes } from './transitions.js';

/**
 * @typedef {import('./shots.js').Shot} Shot
 * @typedef {import('./scene.js').Piece} Piece
 */

/**
 * The background clip: it runs on under the next scene's transition, and
 * carries the transitions in which it is the layer in front.
 * @param {Shot} shot
 * @param {Shot|undefined} next
 * @param {Piece} piece
 * @param {[string, string, string]} colors
 * @param {object[]} grade - Effects of the scene's look, when it grades the background
 * @returns {any}
 */
export function backdrop(shot, next, piece, colors, grade) {
  const { format, seed } = piece;
  const { scene, index } = shot;
  const lengthF = shot.endF + shot.tailF - shot.startF;
  const bg = background(scene.background, {
    colors,
    lengthF,
    fps: format.fps,
    seed: hash(seed, index, 1),
    frame: format,
  });
  /** @param {Shot} of @returns {import('./transitions.js').Change} */
  const arrival = (of) => ({
    kind: of.scene.transition,
    frames: of.inF,
    seed: hash(seed, of.index, 5),
  });
  const change = changes({
    lengthF,
    frame: format,
    arrive: index === 0 || shot.front ? arrival(shot) : null,
    leave: !next ? { kind: 'fade', frames: shot.outF, seed: 0 } : shot.front ? arrival(next) : null,
  });
  return clipAt(shot.startF, shot.startF + lengthF, format.fps, {
    generator: { type: bg.type, seed: hash(seed, index, 2), params: bg.params },
    effects: [...grade, ...change.effects],
    keyframes: keyframes({ ...paramKeys(bg.keys), ...change.keys }, format.fps),
    fadeIn: change.fadeInF / format.fps,
    fadeOut: change.fadeOutF / format.fps,
    fadeInCurve: 'smooth',
    fadeOutCurve: 'smooth',
    label: `Background · ${scene.background}`,
  });
}
