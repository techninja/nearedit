#!/usr/bin/env node

/**
 * Extracts SVG path data from lucide-static for icons used in the app.
 * Generates src/icons.json — loaded by app-icon at runtime.
 * Runs on `npm postinstall`.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ICON_MAP } from './icon-map.js';
import { FX_ICON_MAP } from './icon-map-fx.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ICONS_DIR = resolve(ROOT, 'node_modules/lucide-static/icons');
const OUT = resolve(ROOT, 'src/icons.json');

/**
 * Extract all <path>, <line>, <circle>, <rect>, <polyline> inner content from an SVG file.
 * @param {string} file
 * @returns {string} Combined SVG inner elements
 */
function extractInner(file) {
  const svg = readFileSync(file, 'utf-8');
  const inner = svg.match(/<(path|line|circle|rect|polyline|ellipse)\s[^>]*\/>/g);
  return inner ? inner.join('') : '';
}

mkdirSync(dirname(OUT), { recursive: true });

/** @type {Record<string, string>} */
const icons = {};
let count = 0;

for (const [lucideName, appName] of Object.entries({ ...ICON_MAP, ...FX_ICON_MAP })) {
  const file = resolve(ICONS_DIR, `${lucideName}.svg`);
  if (!existsSync(file)) {
    console.warn(`⚠ Icon not found: ${lucideName}`);
    continue;
  }
  icons[appName] = extractInner(file);
  count++;
}

writeFileSync(OUT, JSON.stringify(icons, null, 2));
console.log(`✓ Built ${count} icons → src/icons.json`);
