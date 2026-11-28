/**
 * Writing a score the way the action does — fit a tempo, lay out the
 * sections, generate — for tests that read its notes or measure its sound.
 * Not part of the runtime API — import it from tests.
 * @module utils/director/score/testing/make
 */

import { fitTempo } from '#utils/director/score/fit.js';
import { generateSong } from '#utils/director/score/generate.js';
import { layoutSections } from '#utils/director/score/sections.js';
import { getStyle } from '#utils/director/score/styles.js';
import { normalizeSong } from '#utils/music/normalize.js';

/**
 * @param {string} styleId
 * @param {{ seconds?: number, energy?: number, seed?: number, bpm?: number, key?: string,
 *   brightness?: number, points?: import('../sections.js').TurningPoint[],
 *   asked?: import('../sections.js').AskedSection[] }} [opts] - 36 seconds
 *   at energy 0.5 with seed 1 unless told otherwise
 * @returns {{ style: import('../style.js').Style, fit: import('../fit.js').Fit,
 *   barSeconds: number, sections: import('../sections.js').Section[], raw: Record<string, any>,
 *   song: import('#utils/music/types.js').Song, harmony: import('../harmony.js').Harmony }}
 *   `raw`: the song as generated; `song`: as the engine completes it
 */
export function makeScore(styleId, opts = {}) {
  const { seconds = 36, energy = 0.5, seed = 1, points = [], asked } = opts;
  const style = getStyle(styleId);
  const fit = fitTempo(seconds, style, { energy, points, bpm: opts.bpm });
  const barSeconds = (fit.beatsPerBar * 60) / fit.bpm;
  const sections = layoutSections({ bars: fit.bars, barSeconds, points, energy, asked });
  const { song: raw, harmony } = generateSong({
    ...{ style, bpm: fit.bpm, bars: fit.bars, sections, seed, rest: fit.rest },
    ...{ key: opts.key, brightness: opts.brightness },
  });
  return { style, fit, barSeconds, sections, raw, song: normalizeSong(raw), harmony };
}
