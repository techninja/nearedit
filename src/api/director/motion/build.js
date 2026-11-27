/**
 * Motion plan → fragment. Deterministic: the plan says what each scene
 * shows; this code decides every time, size, position, colour and
 * keyframe, in whole frames of the target frame rate and for the target
 * resolution. Reference: docs/app-spec/DIRECTOR-MOTION.md § Building.
 * @module api/director/motion/build
 */

import { hash } from '#utils/compose/random.js';
import { getTheme, THEMES } from '#utils/director/motion/themes.js';
import { newId } from '#utils/edl/factory.js';
import { accent } from './accents.js';
import { background } from './backgrounds.js';
import { clipAt, keyframes } from './clips.js';
import { composeScene } from './layout.js';
import { serverMeasure } from './measure.js';
import { particleClips } from './particles.js';
import { schedule } from './shots.js';
import { entrance, entranceSpan, pieceCount, titleFields } from './titles.js';
import { changes, look } from './transitions.js';

/** The rows of a motion fragment, front to back (video track 0 is in front). */
export const ROWS = ['Titles', 'Text', 'Accents', 'Particles', 'Background A', 'Background B'];

/**
 * @typedef {Object} BuildOptions
 * @property {{ fps: number, width: number, height: number }} format
 * @property {number} seed
 * @property {string} pacing - slow | medium | fast
 * @property {number} [duration] - Target length in seconds; 0 = what the scenes ask for
 * @property {import('./measure.js').Measure} [measure] - Text measurement; the server canvas by default
 */

/** @param {Record<string, any>} keys @returns {Record<string, any>} */
const underParams = (keys) =>
  Object.fromEntries(Object.entries(keys).map(([k, v]) => [`generator.params.${k}`, v]));

/**
 * The clips of one scene, by row.
 * @param {import('./shots.js').Shot} shot
 * @param {import('./shots.js').Shot|undefined} next
 * @param {any} plan
 * @param {import('#utils/director/motion/themes.js').Theme} theme
 * @param {Required<BuildOptions>} opts
 * @returns {{ rows: Record<string, any>, fits: boolean }}
 */
function sceneClips(shot, next, plan, theme, opts) {
  const { fps } = opts.format;
  const { scene, index } = shot;
  const colors = theme.backdrops[(hash(opts.seed, 11) + index) % theme.backdrops.length];
  const ruled = scene.accent === 'rule';
  const text = composeScene(scene, theme, opts.format, plan.align, opts.measure, ruled);
  const grade = look(scene.look);

  const lengthF = shot.endF + shot.tailF - shot.startF;
  const bg = background(scene.background, {
    colors,
    lengthF,
    fps,
    seed: hash(opts.seed, index, 1),
    frame: opts.format,
  });
  const arrive = index === 0 || shot.front;
  const change = changes({
    lengthF,
    frame: opts.format,
    arrive: arrive ? { kind: scene.transition, frames: shot.inF, seed: hash(opts.seed, index, 5) } : null,
    leave: !next
      ? { kind: 'fade', frames: shot.outF, seed: 0 }
      : shot.front
        ? { kind: next.scene.transition, frames: next.inF, seed: hash(opts.seed, next.index, 5) }
        : null,
  });
  const rows = {};
  rows[shot.front ? 'Background A' : 'Background B'] = clipAt(shot.startF, shot.startF + lengthF, fps, {
    generator: { type: bg.type, seed: hash(opts.seed, index, 2), params: bg.params },
    effects: [...(grade.on === 'background' ? grade.effects : []), ...change.effects],
    keyframes: keyframes({ ...underParams(bg.keys), ...change.keys }, fps),
    fadeIn: change.fadeInF / fps,
    fadeOut: change.fadeOutF / fps,
    fadeInCurve: 'smooth',
    fadeOutCurve: 'smooth',
    label: `Background · ${scene.background}`,
  });

  const count = pieceCount(scene.title, scene.by, text.title.fitted.lines);
  const animateIn = entrance(scene.textAnimation, scene.by, count, shot.inSeconds);
  const shadow = theme.shadow ? colors[0] : '';
  rows.Titles = clipAt(shot.textF, shot.textEndF, fps, {
    ...titleFields(scene.title, text.title, {
      color: theme.ink,
      shadow,
      animateIn,
      outSeconds: shot.outSeconds,
    }),
    effects: grade.on === 'title' ? grade.effects : [],
  });
  const arrivedF = Math.round(entranceSpan(animateIn, count) * fps);
  if (text.subtitle) {
    const fromF = Math.min(shot.textF + Math.round(arrivedF * 0.7) + 2, shot.textEndF - 4);
    const seconds = Math.min(0.8, ((shot.textEndF - fromF) / fps) * 0.35);
    const kind = theme.subtitle.animation || 'fade';
    const by = kind === 'typewriter' ? 'char' : 'word';
    const pieces = pieceCount(scene.subtitle, by, text.subtitle.fitted.lines);
    rows.Text = clipAt(fromF, shot.textEndF, fps, {
      ...titleFields(scene.subtitle, text.subtitle, {
        color: theme.sub,
        shadow,
        animateIn: entrance(kind, by, pieces, seconds),
        outSeconds: shot.outSeconds,
      }),
    });
  }
  const behind = scene.accent !== 'rule';
  const fromF = behind ? shot.textF : Math.min(shot.textF + Math.round(arrivedF * 0.5), shot.textEndF - 4);
  const accentF = shot.textEndF - fromF;
  const drawF = Math.max(2, Math.min(Math.round(fps * 0.7), Math.floor(accentF * 0.4)));
  const shape = accent(scene.accent, {
    text,
    theme,
    colors,
    frame: opts.format,
    lengthF: accentF,
    drawF,
    seed: hash(opts.seed, index, 4),
  });
  if (shape) {
    rows.Accents = clipAt(fromF, shot.textEndF, fps, {
      generator: { type: 'shape', seed: 0, params: shape.params },
      keyframes: keyframes(underParams(shape.keys), fps),
      transform: { opacity: shape.opacity },
      fadeIn: behind ? drawF / fps : 0,
      fadeOut: shot.outSeconds,
      label: `Accent · ${scene.accent}`,
    });
  }
  return { rows, fits: text.fits };
}

/**
 * Build the fragment of a complete motion plan.
 * @param {{ theme: string, align: 'center'|'left', scenes: any[] }} plan - Every choice made
 *   (`completePlan`)
 * @param {BuildOptions} options
 * @returns {{ tracks: { type: string, index: number, name: string, clips: any[] }[],
 *   markers: object[], notes: string[], seconds: number, shots: import('./shots.js').Shot[] }}
 */
export function buildMotion(plan, options) {
  const opts = { duration: 0, measure: options.measure || serverMeasure(), ...options };
  const { fps } = opts.format;
  const theme = getTheme(plan.theme) || THEMES[0];
  const { shots, totalF, notes } = schedule(plan.scenes, {
    fps,
    pacing: opts.pacing,
    target: opts.duration,
  });
  /** @type {Record<string, any[]>} */
  const rows = Object.fromEntries(ROWS.map((name) => [name, []]));
  shots.forEach((shot, i) => {
    const built = sceneClips(shot, shots[i + 1], plan, theme, /** @type {any} */ (opts));
    for (const [name, clip] of Object.entries(built.rows)) rows[name].push(clip);
    if (!built.fits) {
      notes.push(
        `Scene ${i + 1}: the text is too long to fit the frame at a readable size — ` +
          'shorten it or split it over two scenes.',
      );
    }
  });
  rows.Particles = particleClips(
    shots.map((shot) => ({ ...shot, particles: shot.scene.particles })),
    { fps, seed: opts.seed, frame: opts.format },
  );
  return {
    tracks: ROWS.map((name, index) => ({ type: 'video', index, name, clips: rows[name] })),
    markers: shots.map((shot) => ({
      markerId: newId('m'),
      time: shot.startF / fps,
      label: shot.scene.title.replace(/\s+/g, ' ').slice(0, 80),
      color: '',
    })),
    notes,
    seconds: totalF / fps,
    shots,
  };
}
