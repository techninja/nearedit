/**
 * Contact sheets of the caption presets, for looking at — captions are a
 * design as much as code, and a change to a preset or to the drawing wants
 * a look before it wants a test.
 *
 *   node tests/captions/sheets.js <folder> [seconds]
 *
 * writes `overview-wide.png`, `overview-tall.png`, `overview-square.png`
 * (every preset over the three backdrops, at one instant of the test
 * paragraph) and `strip-<preset>.png` (consecutive frames at 30 fps across
 * a change of group, cropped to the caption). Node only.
 * @module tests/captions/sheets
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createCanvas, registerFonts } from '../../src/api/compose/index.js';
import * as captions from '../../src/utils/captions/index.js';
import { WORDS, drawScene, frameOf } from './scenes.js';

const KINDS = /** @type {const} */ (['photo', 'bright', 'dark']);
const WIDTHS = { wide: 480, tall: 270, square: 320 };
const GAP = 6;
const LABEL = 16;

/**
 * One frame: a backdrop with the caption of a style at a time.
 * @param {string} preset
 * @param {'photo'|'bright'|'dark'} kind
 * @param {'wide'|'tall'|'square'} format
 * @param {number} time - Seconds into the test paragraph
 * @param {number} [width] - Canvas width; the sheet's tile width by default
 * @returns {any} A canvas
 */
function tile(preset, kind, format, time, width = WIDTHS[format]) {
  const frame = frameOf(format, width);
  const canvas = createCanvas(frame.width, frame.height);
  drawScene(canvas.getContext('2d'), captions, { kind, frame, style: preset, time });
  return canvas;
}

/**
 * Lay labelled tiles out in a grid.
 * @param {{ label: string, canvas: any, crop?: { y: number, height: number } }[]} tiles
 * @param {number} columns
 * @returns {Buffer} PNG
 */
function sheet(tiles, columns) {
  const width = tiles[0].canvas.width;
  const height = tiles[0].crop?.height ?? tiles[0].canvas.height;
  const rows = Math.ceil(tiles.length / columns);
  const out = createCanvas(columns * (width + GAP) + GAP, rows * (height + LABEL + GAP) + GAP);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.font = `400 ${LABEL - 4}px "JetBrains Mono"`;
  tiles.forEach(({ label, canvas, crop }, i) => {
    const x = GAP + (i % columns) * (width + GAP);
    const y = GAP + Math.floor(i / columns) * (height + LABEL + GAP);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(label, x + 2, y + LABEL - 4, width - 4);
    ctx.drawImage(canvas, 0, crop?.y ?? 0, width, height, x, y + LABEL, width, height);
  });
  return out.toBuffer('image/png');
}

/**
 * Every preset over every backdrop in one format.
 * @param {'wide'|'tall'|'square'} format
 * @param {number} time
 * @returns {Buffer} PNG
 */
function overview(format, time) {
  const tiles = [];
  const across = format === 'wide' ? KINDS : captions.PRESET_NAMES;
  const down = format === 'wide' ? captions.PRESET_NAMES : KINDS;
  for (const b of down) {
    for (const a of across) {
      const [preset, kind] = format === 'wide' ? [b, a] : [a, b];
      const canvas = tile(preset, /** @type {any} */ (kind), format, time);
      tiles.push({ label: `${preset} / ${kind} / ${format} @${time}s`, canvas });
    }
  }
  return sheet(tiles, across.length);
}

/**
 * Fifteen consecutive frames of a preset at 30 fps, starting three frames
 * before the group on screen at `time` gives way to the next.
 * @param {string} preset
 * @param {number} time
 * @returns {Buffer} PNG
 */
function strip(preset, time) {
  const groups = captions.captionGroups(WORDS, preset);
  const found = captions.captionAt(groups, time) || { group: groups[0] };
  const first = Math.round(found.group.until * 30) - 3;
  const frame = frameOf('wide', 960);
  const style = captions.resolveCaptionStyle(preset);
  const height = 150;
  const y = frame.height - captions.reachOf(style.position.offset, frame) - height * 0.7;
  const tiles = [];
  for (let n = first; n < first + 15; n++) {
    const canvas = createCanvas(460, frame.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(tile(preset, 'photo', 'wide', n / 30, frame.width), -250, 0);
    const label = `${preset} frame ${n} (${(n / 30).toFixed(3)} s)`;
    tiles.push({ label, canvas, crop: { y: Math.max(0, Math.round(y)), height } });
  }
  return sheet(tiles, 3);
}

const [folder, seconds = '3.9'] = process.argv.slice(2);
if (!folder) {
  console.error('usage: node tests/captions/sheets.js <folder> [seconds]');
  process.exitCode = 2;
} else {
  registerFonts();
  const dir = resolve(folder);
  const time = Number(seconds) || 3.9;
  await mkdir(dir, { recursive: true });
  for (const format of /** @type {const} */ (['wide', 'tall', 'square'])) {
    await writeFile(join(dir, `overview-${format}.png`), overview(format, time));
  }
  for (const preset of captions.PRESET_NAMES) {
    await writeFile(join(dir, `strip-${preset}.png`), strip(preset, time));
  }
  console.log(`contact sheets written to ${dir}`);
}
