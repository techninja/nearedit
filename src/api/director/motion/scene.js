/**
 * The clips of one scene of a motion piece, each on the row it belongs to:
 * the background (`backdrop.js`), the words and the accent (`words.js`).
 * @module api/director/motion/scene
 */

import { hash } from '#utils/compose/random.js';
import { backdrop } from './backdrop.js';
import { composeScene } from './layout.js';
import { look } from './transitions.js';
import { ornament, words } from './words.js';

/**
 * @typedef {import('./shots.js').Shot} Shot
 * @typedef {Object} Piece - What every scene of a piece shares
 * @property {{ theme: string, align: 'center'|'left', scenes: any[] }} plan
 * @property {import('#utils/director/motion/themes.js').Theme} theme
 * @property {{ fps: number, width: number, height: number }} format
 * @property {number} seed - A 32-bit integer
 * @property {import('./measure.js').Measure} measure
 */

/**
 * The clips of one scene, by row name (`ROWS` of build.js).
 * @param {Shot} shot
 * @param {Shot|undefined} next
 * @param {Piece} piece
 * @returns {{ rows: Record<string, any>, fits: boolean }} `fits`: the words
 *   fit the frame at a readable size
 */
export function sceneClips(shot, next, piece) {
  const { theme, plan } = piece;
  const { scene, index } = shot;
  const colors = theme.backdrops[(hash(piece.seed, 11) + index) % theme.backdrops.length];
  const ruled = scene.accent === 'rule';
  const text = composeScene(scene, theme, piece.format, plan.align, piece.measure, ruled);
  const grade = look(scene.look);
  const onTitle = grade.on === 'title';
  const shown = words(
    shot,
    piece,
    text,
    theme.shadow ? colors[0] : '',
    onTitle ? grade.effects : [],
  );
  /** @type {Record<string, any>} */
  const rows = { Titles: shown.title };
  rows[shot.front ? 'Background A' : 'Background B'] = backdrop(
    shot,
    next,
    piece,
    colors,
    onTitle ? [] : grade.effects,
  );
  if (shown.subtitle) rows.Text = shown.subtitle;
  const shape = ornament(shot, piece, text, colors, shown.arrivedF);
  if (shape) rows.Accents = shape;
  return { rows, fits: text.fits };
}
