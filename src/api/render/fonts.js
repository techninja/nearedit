/**
 * Font files for titles on FFmpeg builds without fontconfig, where drawtext
 * cannot resolve a family name and needs a path. With fontconfig (the usual
 * case on Linux) none of this is used.
 * @module api/render/fonts
 */

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const FONT_DIRS = [
  '/usr/share/fonts',
  '/usr/local/share/fonts',
  join(homedir(), '.fonts'),
  join(homedir(), '.local/share/fonts'),
  '/System/Library/Fonts',
  '/Library/Fonts',
  'C:\\Windows\\Fonts',
];

/** Families to look for, most common first, by normalised file name. */
const CANDIDATES = {
  'sans-serif': ['dejavusans', 'liberationsans', 'notosans', 'freesans', 'arial', 'helvetica'],
  serif: ['dejavuserif', 'liberationserif', 'notoserif', 'freeserif', 'timesnewroman', 'times'],
  monospace: ['dejavusansmono', 'liberationmono', 'notosansmono', 'freemono', 'couriernew', 'cour'],
};

/** File-name endings per style ("arialbd.ttf", "DejaVuSans-BoldOblique.ttf"). */
const STYLES = {
  regular: ['', 'regular', 'book'],
  bold: ['bold', 'bd'],
  italic: ['italic', 'oblique', 'i'],
  bolditalic: ['bolditalic', 'boldoblique', 'bi', 'z'],
};

/**
 * Choose font files for the three EDL families from a list of paths.
 * @param {string[]} paths - Font file paths (.ttf, .otf, .ttc)
 * @returns {Record<string, Record<string, string>>} family → style → path;
 *   a family is absent when none of its candidates is installed
 */
export function pickFontFiles(paths) {
  const byName = new Map();
  for (const path of paths) {
    const name = basename(path)
      .replace(/\.(ttf|otf|ttc)$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (!byName.has(name)) byName.set(name, path);
  }
  /** @type {Record<string, Record<string, string>>} */
  const picked = {};
  for (const [family, candidates] of Object.entries(CANDIDATES)) {
    const base = candidates.find((name) => STYLES.regular.some((end) => byName.has(name + end)));
    if (!base) continue;
    picked[family] = {};
    for (const [style, endings] of Object.entries(STYLES)) {
      const end = endings.find((ending) => byName.has(base + ending));
      if (end !== undefined) picked[family][style] = byName.get(base + end);
    }
  }
  return picked;
}

/**
 * Scan the usual font directories.
 * @param {string[]} [dirs]
 * @returns {Record<string, Record<string, string>>}
 */
export function findFontFiles(dirs = FONT_DIRS) {
  const paths = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const entry of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
        if (/\.(ttf|otf|ttc)$/i.test(entry)) paths.push(join(dir, entry));
      }
    } catch (err) {
      console.warn(`[render] cannot scan fonts in ${dir}: ${err.message}`);
    }
  }
  return pickFontFiles(paths);
}
