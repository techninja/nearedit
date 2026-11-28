/**
 * The effect list. To add an effect: write its module in this folder (see
 * README.md) and add it to the array below — nothing else.
 * Ready-made stacks of these effects are in `presets.js`; what each effect
 * does to a layer's alpha, and how they combine, is in
 * docs/app-spec/EFFECTS.md.
 * @module utils/compose/effects
 */

import blur from './blur.js';
import chromaKey from './chromaKey.js';
import colorAdjust from './colorAdjust.js';
import colorBalance from './colorBalance.js';
import dropShadow from './dropShadow.js';
import flicker from './flicker.js';
import glow from './glow.js';
import grain from './grain.js';
import levels from './levels.js';
import mask from './mask.js';
import mirror from './mirror.js';
import outline from './outline.js';
import pixelate from './pixelate.js';
import posterize from './posterize.js';
import rgbSplit from './rgbSplit.js';
import scanlines from './scanlines.js';
import stylize from './stylize.js';
import tint from './tint.js';
import vignette from './vignette.js';
import wipe from './wipe.js';

/** Every effect, in the order menus list them. */
export default [
  colorAdjust,
  colorBalance,
  levels,
  tint,
  stylize,
  posterize,
  blur,
  glow,
  dropShadow,
  outline,
  vignette,
  grain,
  scanlines,
  flicker,
  pixelate,
  rgbSplit,
  mirror,
  chromaKey,
  mask,
  wipe,
];
