/**
 * What the timeline draws on an element clip (a brand element): under the
 * label strip, the colours of its design as a few chips and the name of the
 * element it is an instance of; and a mark at the right of the label strip
 * while it is out of date with the project's kit.
 * @module utils/timeline/draw/elementClip
 */

import { currentKit } from '#utils/brandUi/kitState.js';
import { staleInfo } from '#utils/brandUi/stale.js';
import {
  elementClipLabel,
  elementColors,
  elementMark,
  elementName,
} from '#utils/timeline/clipMarksElement.js';
import { fitText } from './shapes.js';

/** @typedef {import('./scene.js').Scene} Scene */
/** @typedef {{ x0: number, x1: number, y: number, height: number }} ClipBox */

/** Height of the label strip the body sits under. */
const LABEL_H = 15;
const CHIP = 8;
const MARKS = { outdated: 'out of date', missing: 'not in brand' };
const MARK_PAD = 5;

/**
 * @param {any} clip - An element clip
 * @returns {string} The name shown on it
 */
export const elementLabel = (clip) => elementClipLabel(clip, currentKit());

/**
 * The body of an element clip: colour chips, then the element's name
 * (left out when the label strip already says it).
 * @param {Scene} scene
 * @param {any} clip
 * @param {ClipBox} box
 */
export function drawElementBody(scene, clip, box) {
  const { ctx, vp, palette } = scene;
  const top = box.y + LABEL_H + 2;
  const left = Math.max(box.x0, 0) + 5;
  const right = Math.min(box.x1, vp.width) - 4;
  if (box.y + box.height - top < CHIP + 2 || right - left < CHIP + 4) return;
  let x = left;
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.clipText;
  for (const color of elementColors(clip.element.design)) {
    if (x + CHIP > right) break;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, top + 0.5, CHIP, CHIP, 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
    x += CHIP + 3;
  }
  const kit = currentKit();
  const name = elementName(clip, kit);
  if (name === elementClipLabel(clip, kit)) return;
  ctx.font = `10px ${palette.sans}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.clipText;
  ctx.globalAlpha = 0.85;
  const text = fitText(ctx, name, right - x - 3);
  if (text) ctx.fillText(text, x + 2, top + CHIP / 2 + 1);
  ctx.globalAlpha = 1;
}

/**
 * The mark of an element clip that is out of date with the project's kit,
 * at the right end of the label strip: its words when they fit, else a dot.
 * @param {Scene} scene
 * @param {any} clip
 * @param {ClipBox} box
 * @param {number} taken - Pixels at the right end already used (the "fx" badge)
 * @returns {number} Pixels the mark takes from the label's room; 0 = none drawn
 */
export function drawElementMark(scene, clip, box, taken) {
  const mark = elementMark(clip, staleInfo(scene.doc).byClip);
  const width = box.x1 - box.x0;
  if (!mark || width < 26) return 0;
  const { ctx, palette, vp } = scene;
  ctx.font = `bold 9px ${palette.sans}`;
  const text = MARKS[mark];
  const wide = width >= 150 ? Math.ceil(ctx.measureText(text).width) + 2 * MARK_PAD : 11;
  const x = Math.min(box.x1, vp.width + 8) - taken - wide - 3;
  ctx.fillStyle = palette.warning;
  ctx.beginPath();
  ctx.roundRect(x, box.y + 2, wide, 11, wide > 11 ? 3 : 5.5);
  ctx.fill();
  if (wide > 11) {
    ctx.textBaseline = 'middle';
    ctx.fillStyle = palette.clipText;
    ctx.fillText(text, x + MARK_PAD, box.y + 8);
  }
  return wide + 5;
}
