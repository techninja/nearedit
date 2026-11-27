/**
 * The words of a scene of a motion piece as clips — title, subtitle — and
 * the accent that goes with them, timed against each other: the subtitle
 * follows the title, a rule is drawn while the title arrives.
 * @module api/director/motion/words
 */

import { hash } from '#utils/compose/random.js';
import { accent } from './accents.js';
import { clipAt, keyframes, paramKeys } from './clips.js';
import { entrance, entranceSpan, pieceCount, titleFields } from './titles.js';

/**
 * @typedef {import('./shots.js').Shot} Shot
 * @typedef {import('./scene.js').Piece} Piece
 */

/**
 * The title and subtitle clips. The subtitle follows once most of the
 * title has arrived.
 * @param {Shot} shot
 * @param {Piece} piece
 * @param {import('./layout.js').Composition} text
 * @param {string} shadow - Shadow colour, '' for none
 * @param {object[]} glow - Effects of the scene's look, when it belongs on the title
 * @returns {{ title: any, subtitle: any|null, arrivedF: number }} `arrivedF`:
 *   frames the title's entrance takes
 */
export function words(shot, piece, text, shadow, glow) {
  const { theme } = piece;
  const { fps } = piece.format;
  const { scene } = shot;
  const count = pieceCount(scene.title, scene.by, text.title.fitted.lines);
  const animateIn = entrance(scene.textAnimation, scene.by, count, shot.inSeconds);
  const leaving = { shadow, outSeconds: shot.outSeconds };
  const title = clipAt(shot.textF, shot.textEndF, fps, {
    ...titleFields(scene.title, text.title, { ...leaving, color: theme.ink, animateIn }),
    effects: glow,
  });
  const arrivedF = Math.round(entranceSpan(animateIn, count) * fps);
  if (!text.subtitle) return { title, subtitle: null, arrivedF };
  const fromF = Math.min(shot.textF + Math.round(arrivedF * 0.7) + 2, shot.textEndF - 4);
  const seconds = Math.min(0.8, ((shot.textEndF - fromF) / fps) * 0.35);
  const kind = theme.subtitle.animation || 'fade';
  const by = kind === 'typewriter' ? 'char' : 'word';
  const pieces = pieceCount(scene.subtitle, by, text.subtitle.fitted.lines);
  const subtitle = clipAt(fromF, shot.textEndF, fps, {
    ...titleFields(scene.subtitle, text.subtitle, {
      ...leaving,
      color: theme.sub,
      animateIn: entrance(kind, by, pieces, seconds),
    }),
  });
  return { title, subtitle, arrivedF };
}

/**
 * The accent clip. A rule is drawn once half the title is there; the
 * shapes that lie behind the words come in with them.
 * @param {Shot} shot
 * @param {Piece} piece
 * @param {import('./layout.js').Composition} text
 * @param {[string, string, string]} colors
 * @param {number} arrivedF
 * @returns {any|null}
 */
export function ornament(shot, piece, text, colors, arrivedF) {
  const { fps } = piece.format;
  const { scene } = shot;
  const behind = scene.accent !== 'rule';
  const fromF = behind
    ? shot.textF
    : Math.min(shot.textF + Math.round(arrivedF * 0.5), shot.textEndF - 4);
  const lengthF = shot.textEndF - fromF;
  const drawF = Math.max(2, Math.min(Math.round(fps * 0.7), Math.floor(lengthF * 0.4)));
  const shape = accent(scene.accent, {
    text,
    theme: piece.theme,
    colors,
    frame: piece.format,
    lengthF,
    drawF,
    fps,
    seed: hash(piece.seed, shot.index, 4),
  });
  if (!shape) return null;
  return clipAt(fromF, shot.textEndF, fps, {
    generator: { type: 'shape', seed: 0, params: shape.params },
    keyframes: keyframes(paramKeys(shape.keys), fps),
    transform: { opacity: shape.opacity },
    fadeIn: behind ? drawF / fps : 0,
    fadeOut: shot.outSeconds,
    label: `Accent · ${scene.accent}`,
  });
}
