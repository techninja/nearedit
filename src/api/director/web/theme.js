/**
 * The theme of a site demo. A named theme is used as it is; `auto` looks
 * at the page itself — the snapshot's picture — and takes a ground that
 * sets it off: a dark one for a light page, the paper one for a dark page,
 * and among those the one closest in colour to the page's own accent.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § Looks.
 * @module api/director/web/theme
 */

import { loadImage } from '@napi-rs/canvas';
import { channels, luminance } from '#utils/director/motion/color.js';
import { AUTO, THEMES, getTheme } from '#utils/director/motion/themes.js';
import { createCanvas } from '../../compose/index.js';

/** @typedef {import('#utils/director/motion/themes.js').Theme} Theme */
/** @typedef {{ light: boolean, hue: number|null }} Tone - `hue` in degrees; null for a page without colour */

const SAMPLE = [48, 27];
const BINS = 12;

/**
 * @param {number} r @param {number} g @param {number} b - 0..255
 * @returns {{ hue: number, saturation: number, value: number }} Hue in degrees
 */
function hsv(r, g, b) {
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  const spread = max - min;
  let hue = 0;
  if (spread) {
    if (max === r) hue = ((g - b) / spread) % 6;
    else hue = max === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  }
  return { hue: (hue * 60 + 360) % 360, saturation: max ? spread / max : 0, value: max / 255 };
}

/** @param {string} hex @returns {number} Hue of a colour, degrees */
const hueOf = (hex) => hsv(...channels(hex)).hue;

/**
 * How a page looks from afar: light or dark, and the hue of its accents.
 * @param {string} image - A PNG data URL (a snapshot's `image`)
 * @returns {Promise<Tone|null>} null when there is no picture to look at
 */
export async function pageTone(image) {
  const data = /^data:image\/png;base64,(.+)$/.exec(image || '')?.[1];
  if (!data) return null;
  try {
    const picture = await loadImage(Buffer.from(data, 'base64'));
    const ctx = createCanvas(SAMPLE[0], SAMPLE[1]).getContext('2d');
    ctx.drawImage(picture, 0, 0, SAMPLE[0], SAMPLE[1]);
    const pixels = ctx.getImageData(0, 0, SAMPLE[0], SAMPLE[1]).data;
    const bins = Array.from({ length: BINS }, () => ({ weight: 0, x: 0, y: 0 }));
    let light = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
      light += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const { hue, saturation, value } = hsv(r, g, b);
      if (saturation < 0.25 || value < 0.2) continue;
      const bin = bins[Math.floor(hue / (360 / BINS)) % BINS];
      bin.weight += saturation;
      bin.x += Math.cos((hue * Math.PI) / 180) * saturation;
      bin.y += Math.sin((hue * Math.PI) / 180) * saturation;
    }
    const count = pixels.length / 4;
    const best = bins.reduce((a, b) => (b.weight > a.weight ? b : a));
    // A fleck of colour is not the page's colour: it takes a button's worth.
    const hue = best.weight > count * 0.003 ? (Math.atan2(best.y, best.x) * 180) / Math.PI : null;
    return { light: light / count >= 0.45, hue: hue === null ? null : (hue + 360) % 360 };
  } catch (err) {
    console.warn(`[director] could not read the page's picture: ${err.message}`);
    return null;
  }
}

/**
 * The entry of a list whose colour is nearest a hue.
 * @template T
 * @param {T[]} list - Not empty
 * @param {(entry: T) => string} colorOf
 * @param {number|null} hue
 * @returns {T} The first entry when there is no hue to go by
 */
function nearest(list, colorOf, hue) {
  if (hue === null) return list[0];
  const away = (/** @type {T} */ entry) => {
    const turn = Math.abs(hueOf(colorOf(entry)) - hue) % 360;
    return Math.min(turn, 360 - turn);
  };
  return list.reduce((a, b) => (away(b) < away(a) ? b : a));
}

/**
 * The theme and the colour way of a demo.
 * @param {string} asked - A theme id, or `auto`
 * @param {Tone|null} tone - Of the page
 * @returns {{ theme: Theme, colors: [string, string, string], why: string }} `why`
 *   says how `auto` chose; '' for a named theme
 */
export function demoTheme(asked, tone) {
  const hue = tone ? tone.hue : null;
  const named = asked === AUTO ? undefined : getTheme(asked);
  const ground = (/** @type {Theme} */ theme) => theme.backdrops[0][1];
  const dark = THEMES.filter((theme) => luminance(ground(theme)) < 0.2);
  const lit = THEMES.filter((theme) => luminance(ground(theme)) >= 0.2);
  const pool = tone && !tone.light && lit.length ? lit : dark;
  const theme = named || nearest(pool, (entry) => entry.backdrops[0][2], hue);
  const colors = nearest(theme.backdrops, (way) => way[2], hue);
  const page = tone ? (tone.light ? 'a light page' : 'a dark page') : 'the page';
  const why = named
    ? ''
    : `auto: a ${pool === lit ? 'light' : 'dark'} ground for ${page}` +
      (hue === null ? '' : ', the closest to its own colour');
  return { theme, colors, why };
}
