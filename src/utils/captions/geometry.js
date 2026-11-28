/**
 * Where a caption's words go: the lines centred in the frame at the style's
 * position, shrunk when a line would leave the safe margins. This is the
 * part of a layout that stays the same for as long as a group is on screen
 * — no word ever moves because another one is being said. Pure: text
 * measurement is injected.
 * Isomorphic. Contract: docs/app-spec/CAPTIONS.md § Style.
 * @module utils/captions/geometry
 */

import { EM, SAFE, fontOf, fontSize, gapOf, growthOf, reachOf, roomOf, unitOf } from './metrics.js';
import { isRtl } from './text.js';

/**
 * @typedef {import('./types.js').CaptionStyle} CaptionStyle
 * @typedef {import('./types.js').CaptionFrame} CaptionFrame
 * @typedef {import('./types.js').Rect} Rect
 */

/**
 * Lay a group's words out.
 * @param {import('./types.js').CaptionGroup} group
 * @param {CaptionStyle} style - Resolved
 * @param {CaptionFrame} frame
 * @param {(text: string) => number} measure - Width of a run of text in
 *   `fontOf(style, frame)`, canvas pixels
 * @param {number} [lane=0] - Voices at once: lane 1 sits one caption
 *   further from the anchored edge than lane 0
 * @returns {{ unit: number, size: number, font: string, rtl: boolean, box: Rect, room:
 *   ReturnType<typeof roomOf>, words: { text: string, x: number, y: number, cy: number,
 *   width: number, line: number }[] }}
 */
export function placeWords(group, style, frame, measure, lane = 0) {
  const unit = unitOf(frame);
  const full = fontSize(style.size * unit);
  const space = measure(' ');
  const widths = group.words.map((word) => measure(word.text));
  // Each line: where its words start, measured from the line's own left edge.
  const rows = [];
  let at = 0;
  for (const count of group.lines) {
    let width = 0;
    const lefts = [];
    for (let i = at; i < at + count; i++) {
      if (i > at && !group.words[i].glue) {
        width += gapOf(style, unit, full, space, Math.max(widths[i - 1], widths[i]));
      }
      lefts.push(width);
      width += widths[i];
    }
    // A word that grows does so about its middle: the line must hold it at its biggest.
    const grown = width + growthOf(style) * Math.max(...widths.slice(at, at + count));
    rows.push({ from: at, lefts, width, grown });
    at += count;
  }
  const widest = Math.max(1, ...rows.map((row) => row.width));
  const free = frame.width - 2 * (SAFE.x * unit + roomOf(style, unit, full).x);
  // Shrink rather than leave the frame; everything below is at the size that fits.
  const need = Math.max(1, ...rows.map((row) => row.grown));
  const size = fontSize(full * Math.max(0.05, Math.min(1, free / need)));
  const fit = size / full;
  const room = roomOf(style, unit, size);
  const pitch = size * EM.line;
  const height = rows.length * pitch;
  const { anchor, offset } = style.position;
  const step = lane * (style.group.lines * pitch + room.top + room.bottom + 0.4 * size);
  const low = SAFE.y * unit + room.top;
  const high = Math.max(low, frame.height - SAFE.y * unit - room.bottom - height);
  let top = (frame.height - height) / 2 + step;
  if (anchor === 'top') top = reachOf(offset, frame, 'top') + step;
  if (anchor === 'bottom') top = frame.height - reachOf(offset, frame) - height - step;
  top = Math.max(low, Math.min(high, top));
  const rtl = isRtl(group.text);
  const words = [];
  rows.forEach((row, line) => {
    const left = (frame.width - row.width * fit) / 2;
    const cy = top + pitch * (line + 0.5);
    row.lefts.forEach((x, i) => {
      const width = widths[row.from + i] * fit;
      const from = rtl ? row.width * fit - x * fit - width : x * fit;
      const y = cy + (EM.cap * size) / 2;
      words.push({ text: group.words[row.from + i].text, x: left + from, y, cy, width, line });
    });
  });
  const box = { x: (frame.width - widest * fit) / 2, y: top, width: widest * fit, height };
  return { unit, size, font: fontOf(style, frame, size), rtl, box, room, words };
}
