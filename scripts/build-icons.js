#!/usr/bin/env node

/**
 * Extracts SVG path data from lucide-static for icons used in the app.
 * Generates src/icons.json — loaded by app-icon at runtime.
 * Runs on `npm postinstall`.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ICONS_DIR = resolve(ROOT, 'node_modules/lucide-static/icons');
const OUT = resolve(ROOT, 'src/icons.json');

/** Icons used in the app — lucide name → app name */
const ICON_MAP = {
  plus: 'plus',
  check: 'check',
  'trash-2': 'trash',
  x: 'x',
  pencil: 'edit',
  'chevron-right': 'chevron',
  folder: 'folder',
  'grip-vertical': 'grip',
  list: 'list',
  'layout-grid': 'grid',
  filter: 'filter',
  settings: 'settings',
  // Video editor — transport
  play: 'play',
  pause: 'pause',
  'skip-back': 'skip-back',
  'skip-forward': 'skip-forward',
  'step-back': 'step-back',
  'step-forward': 'step-forward',
  // Video editor — timeline
  scissors: 'split',
  'move-horizontal': 'slip',
  'arrow-left-right': 'trim',
  layers: 'layers',
  'layers-2': 'layers-2',
  'copy-plus': 'duplicate',
  'flip-horizontal': 'flip',
  // Video editor — tracks
  'volume-2': 'volume',
  'volume-x': 'mute',
  headphones: 'solo',
  eye: 'visible',
  'eye-off': 'hidden',
  lock: 'lock',
  unlock: 'unlock',
  // Video editor — media
  film: 'film',
  music: 'music',
  image: 'image',
  'file-video': 'file-video',
  'file-audio': 'file-audio',
  // Video editor — tools
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
  maximize: 'maximize',
  minimize: 'minimize',
  'undo-2': 'undo',
  'redo-2': 'redo',
  download: 'export',
  upload: 'import',
  wand: 'wand',
  sparkles: 'ai',
  'message-square': 'prompt',
  // Layout
  'panel-left': 'panel-left',
  'panel-bottom': 'panel-bottom',
  monitor: 'monitor',
  smartphone: 'mobile',
};

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

for (const [lucideName, appName] of Object.entries(ICON_MAP)) {
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
