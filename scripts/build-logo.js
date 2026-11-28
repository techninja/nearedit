#!/usr/bin/env node

/**
 * Draws the PNG renditions of the logo from the SVG files in `src/logo/`,
 * which are the source of truth. Run it after changing one of them:
 *
 *   node scripts/build-logo.js
 *
 * The pictures are committed; nothing runs this at install.
 * @module scripts/build-logo
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NAVY = '#0f172a';

/**
 * @typedef {Object} Rendition
 * @property {string} out - The PNG, from the repository root
 * @property {string} from - The SVG in `src/logo/`
 * @property {number} width - Pixels
 * @property {number} [height] - Pixels; by default what the SVG's shape gives
 * @property {string} [ground] - A colour behind the drawing; none = transparent
 * @property {number} [share] - Part of the width the drawing takes (1 = all of it)
 */

/** @type {Rendition[]} */
export const RENDITIONS = [
  // The app: browser tab, home screen, install icons.
  { out: 'src/logo/png/favicon-32.png', from: 'favicon.svg', width: 32 },
  // iOS rounds the corners itself and shows transparency as black: a full square.
  { out: 'src/logo/png/apple-touch-icon.png', from: 'icon.svg', width: 180, ground: NAVY },
  { out: 'src/logo/png/icon-192.png', from: 'icon.svg', width: 192 },
  { out: 'src/logo/png/icon-512.png', from: 'icon.svg', width: 512 },
  // A link preview: the wordmark on navy, two to one.
  ...[{ from: 'wordmark-on-dark.svg', width: 1280, height: 640, ground: NAVY, share: 0.58 }].map(
    (r) => ({ ...r, out: 'src/logo/png/wordmark-social.png' }),
  ),
  // The examples: the sprite of "Falling logos", and NearEdit's own brand kit.
  { out: 'examples/falling-logos/logo.png', from: 'icon.svg', width: 800 },
  { out: 'examples/kits/nearedit/mark.png', from: 'icon.svg', width: 512 },
  { out: 'examples/kits/nearedit/logo.png', from: 'wordmark-on-dark.svg', width: 1100 },
];

/**
 * The size of an SVG's drawing, from its `viewBox`.
 * @param {string} svg
 * @returns {{ width: number, height: number }}
 */
function viewBoxOf(svg) {
  const box = /<svg[^>]*\sviewBox="([^"]+)"/.exec(svg)?.[1].trim().split(/\s+/).map(Number);
  if (box?.length !== 4 || box.some(Number.isNaN)) throw new Error('The SVG has no viewBox');
  return { width: box[2], height: box[3] };
}

/**
 * Draw one rendition. The SVG is given the size it is drawn at, so it is
 * rasterised once, at that size, and never scaled as a picture.
 * @param {Rendition} rendition
 * @param {string} [root] - The repository
 * @returns {Promise<import('@napi-rs/canvas').Canvas>}
 */
export async function drawRendition(rendition, root = ROOT) {
  const svg = readFileSync(resolve(root, 'src/logo', rendition.from), 'utf8');
  const box = viewBoxOf(svg);
  const width = rendition.width;
  const height = rendition.height ?? Math.round((width * box.height) / box.width);
  const w = Math.round(width * (rendition.share ?? 1));
  const h = Math.round((w * box.height) / box.width);
  const sized = svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
  const image = await loadImage(Buffer.from(sized));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (rendition.ground) {
    ctx.fillStyle = rendition.ground;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(image, Math.round((width - w) / 2), Math.round((height - h) / 2));
  return canvas;
}

/**
 * Draw and write every rendition.
 * @returns {Promise<void>}
 */
async function build() {
  for (const rendition of RENDITIONS) {
    const canvas = await drawRendition(rendition);
    const file = resolve(ROOT, rendition.out);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, canvas.toBuffer('image/png'));
    console.log(`✓ ${rendition.out}  ${canvas.width} × ${canvas.height}  ← ${rendition.from}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await build();
