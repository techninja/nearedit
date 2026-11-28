/**
 * A recorded demo → fragment. The recording becomes one web clip — with
 * its recipe, so it can be changed and recorded again — carrying the
 * camera's zoom keyframes; around it go the look (a window over a
 * generated background, or the full frame), a caption per stop, an
 * optional title card and a marker per stop. Everything is placed in whole
 * frames. Reference: docs/app-spec/DIRECTOR-WEB.md § The fragment.
 * @module api/director/web/build
 */

import { seedOf } from '#utils/compose/random.js';
import { mix } from '#utils/director/motion/color.js';
import { newId } from '#utils/edl/factory.js';
import { hostOf } from '#utils/web/index.js';
import { background } from '../motion/backgrounds.js';
import { clipAt, keyframes, paramKeys } from '../motion/clips.js';
import { serverMeasure } from '../motion/measure.js';
import { cameraKeys } from './camera.js';
import { captionClips } from './captions.js';
import { windowEffects } from './stage.js';

/** The rows of a site demo fragment, front to back (video track 0 is in front). */
export const ROWS = ['Titles', 'Text', 'Page', 'Background'];
/** Seconds the page takes to arrive: a fade, during the rest before its first step. */
const ARRIVE = 0.4;

/**
 * @typedef {Object} DemoParts
 * @property {import('../../web/cache.js').Recording} recording
 * @property {import('#utils/web/types.js').Recipe} recipe - Normalised; what was recorded
 * @property {import('./stage.js').Stage} stage
 * @property {import('#utils/director/motion/themes.js').Theme} theme
 * @property {[string, string, string]} colors - The ground's colour way: edge, middle, light
 * @property {{ fps: number, width: number, height: number }} format
 * @property {import('./card.js').Card} card
 * @property {string[]} labels - What each step is called on its marker
 * @property {boolean} zoom - Zoom on clicks and typing, not only on `focus` steps
 * @property {boolean} captions
 * @typedef {Object} BuiltDemo
 * @property {{ type: string, index: number, name: string, clips: any[] }[]} tracks
 * @property {object[]} markers
 * @property {number} seconds
 * @property {{ zooms: number, captions: number, top: number }} counts
 */

/**
 * @param {DemoParts} parts
 * @returns {BuiltDemo}
 */
export function buildDemo(parts) {
  const { recording, recipe, stage, theme, colors, format, card } = parts;
  const { fps } = format;
  const { track } = recording;
  const startF = card.frames;
  const lengthF = Math.round(recording.duration * fps);
  const endF = startF + lengthF;
  const windowed = stage.look === 'window';
  const arriveF = windowed || startF ? Math.min(Math.round(ARRIVE * fps), lengthF >> 1) : 0;
  const keys = cameraKeys(track, stage, { clicks: parts.zoom, recipe });
  const page = clipAt(startF, endF, fps, {
    sourceFile: recording.file,
    sourceOut: recording.duration,
    web: { recipe, key: recording.key, title: (recording.title || '').slice(0, 300) },
    label: recording.title || hostOf(recipe.url),
    transform: { fit: 'cover', scaleX: stage.scale, scaleY: stage.scale },
    effects: windowEffects(stage, mix(colors[0], '#000000', 0.55)),
    keyframes: keys,
    fadeIn: arriveF / fps,
    fadeInCurve: 'smooth',
  });
  // The ground runs under the whole piece; behind a page that fills the frame it only carries the title card.
  const groundF = windowed ? endF : startF ? startF + arriveF : 0;
  const ground = [];
  if (groundF) {
    const seed = seedOf(hostOf(recipe.url));
    const bg = background(theme.backgrounds[0], {
      colors,
      lengthF: groundF,
      fps,
      seed,
      frame: format,
    });
    ground.push(
      clipAt(0, groundF, fps, {
        generator: { type: bg.type, seed, params: bg.params },
        keyframes: keyframes(paramKeys(bg.keys), fps),
        label: `Background · ${theme.label}`,
      }),
    );
  }
  const said = parts.captions
    ? captionClips({ track, keys, stage, theme, colors, fps, startF, measure: serverMeasure() })
    : { clips: [], top: 0 };
  const rows = {
    Titles: [...card.titles, ...said.clips],
    Text: card.text,
    Page: [page],
    Background: ground,
  };
  const moves = keys['transform.scaleX'] || [];
  return {
    tracks: ROWS.map((name, index) => ({ type: 'video', index, name, clips: rows[name] })),
    markers: track.steps.map((step, i) => ({
      markerId: newId('m'),
      time: (startF + Math.round(step.start * fps)) / fps,
      label: (parts.labels[i] || step.do).replace(/\s+/g, ' ').slice(0, 80),
      color: '',
    })),
    seconds: endF / fps,
    counts: {
      // Every rise of the scale is one move closer.
      zooms: moves.filter((key, i) => i > 0 && key.v > moves[i - 1].v + 1e-6).length,
      captions: said.clips.length,
      top: said.top,
    },
  };
}
