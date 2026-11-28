/**
 * Fixture pictures for the compositor tests, drawn on the server canvas and
 * saved as PNG so the browser decodes the very same bytes.
 * @module tests/compose/fixtures
 */

import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

/** A bundled font file that stands in for a brand's own, under another family name. */
const BRAND_FONT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/vendor/fonts/caveat/caveat-latin-700-normal.woff2',
);

/**
 * A 640×360 opaque test card: gradient, hard edges, fine lines, a circle.
 * Stands in for a still and for a footage frame.
 * @returns {Buffer} PNG
 */
export function cardPng() {
  const canvas = createCanvas(640, 360);
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 640, 360);
  sky.addColorStop(0, '#0ea5e9');
  sky.addColorStop(0.5, '#fde68a');
  sky.addColorStop(1, '#be123c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 640, 360);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(40, 40, 120, 80);
  ctx.fillStyle = '#111827';
  ctx.fillRect(480, 240, 120, 80);
  ctx.strokeStyle = '#16a34a';
  ctx.lineWidth = 3;
  for (let x = 200; x < 440; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x + 60, 340);
    ctx.stroke();
  }
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.arc(320, 180, 70, 0, Math.PI * 2);
  ctx.fill();
  return canvas.toBuffer('image/png');
}

/**
 * A 256×256 picture with transparency: a soft-edged disc and a ring.
 * @returns {Buffer} PNG
 */
export function logoPng() {
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(128, 128, 20, 128, 128, 120);
  glow.addColorStop(0, 'rgba(250, 204, 21, 1)');
  glow.addColorStop(1, 'rgba(250, 204, 21, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(128, 128, 80, 0, Math.PI * 2);
  ctx.stroke();
  return canvas.toBuffer('image/png');
}

/**
 * Write the fixture pictures, and the font file that plays a brand's own
 * font, into a fresh temporary folder.
 * @returns {Promise<{ dir: string, card: string, logo: string, font: string,
 *   remove: () => Promise<void> }>}
 */
export async function writeFixtures() {
  const dir = await mkdtemp(join(tmpdir(), 'nearedit-compose-'));
  const card = join(dir, 'card.png');
  const logo = join(dir, 'logo.png');
  const font = join(dir, 'brand-font.woff2');
  await writeFile(card, cardPng());
  await writeFile(logo, logoPng());
  await copyFile(BRAND_FONT, font);
  return { dir, card, logo, font, remove: () => rm(dir, { recursive: true, force: true }) };
}
