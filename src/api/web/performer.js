/**
 * The performer plays a score on a page: for every frame it starts the
 * steps that begin there, has the page draw that instant (one call into
 * the page), and sends the frame's input events. It also writes down what
 * happened — the steps, the pointer's path and the scrolling of the track.
 * Reference: WEBCLIP.md § Recording.
 * @module api/web/performer
 */

import { beginStep, missing } from './begin.js';
import { mouse } from './input.js';
import { createScene } from './scene.js';

/**
 * @typedef {import('./acts.js').Act} Act
 * @typedef {Object} Stage - What a performance needs
 * @property {import('./tab.js').Tab} tab
 * @property {import('./stepper.js').Stepper} stepper
 * @property {import('#utils/web/types.js').Recipe} recipe - Normalised
 * @property {import('#utils/web/types.js').Score} score
 * @property {(url: string, between: () => Promise<void>) => Promise<void>} load - Go to a page
 * @property {(message: string) => void} warn
 * @typedef {Object} Performer
 * @property {(n: number) => Promise<{ sent: Promise<any>[], discrete: boolean }>} frame - Prepare
 *   frame `n`. `sent`: the input commands, answered once the frame is drawn; `discrete`: a
 *   button or a key was among them
 * @property {() => Promise<void>} rest - Draw the page as it stands (while a page loads)
 * @property {() => { steps: any[], cursor: number[][], scroll: number[][] }} track
 */

const round = (/** @type {number} */ value) => Math.round(value * 10) / 10;

/**
 * @param {Stage} stage
 * @param {number} [steps] - Play only this many steps (a snapshot)
 * @returns {Performer}
 */
export function createPerformer(stage, steps = stage.score.steps.length) {
  const { tab, stepper, recipe, score } = stage;
  const { fps } = score;
  const { width, height } = recipe.viewport;
  const spans = score.steps.slice(0, steps).map((at, step) => ({
    ...{ step, S: Math.round(at.start * fps), A: Math.round(at.actionEnd * fps) },
    E: Math.round(at.end * fps),
  }));
  /** @type {any[]} */
  const rows = score.steps.map((at) => ({ ...at, missing: false }));
  const scene = createScene(recipe, fps);
  const { pointer } = scene;
  const sent_ = { x: NaN, y: NaN };
  /** @type {Act[]} */
  let acts = [];
  /** @type {number[][]} */
  const cursorTrack = [];
  /** @type {number[][]} */
  const scrollTrack = [];
  let next = 0;
  const miss = missing(recipe, rows, stage.warn);
  const rest = async () => {
    const seen = await tab.call('frame', scene.still());
    await stepper.sync(seen.drift);
  };
  const playing = { ...stage, spans, rows, hide: scene.hide, miss, rest };

  return {
    rest,
    async frame(n) {
      /** @type {Promise<any>[]} */
      const sent = [];
      let discrete = false;
      /** Draw instant `n` with every act in play, and send the input of the acts given. */
      const play = async (/** @type {Act[]} */ cued) => {
        const { state, held } = scene.at(n, acts);
        const seen = await tab.call('frame', state);
        await stepper.sync(seen.drift);
        if (pointer.shown && seen.x !== null) Object.assign(pointer, { x: seen.x, y: seen.y });
        /** @type {import('./input.js').Command[]} */
        const commands = [];
        const inside =
          pointer.x >= 0 && pointer.y >= 0 && pointer.x <= width && pointer.y <= height;
        const here = () => mouse('mouseMoved', pointer, { held });
        if (pointer.shown && inside && (pointer.x !== sent_.x || pointer.y !== sent_.y)) {
          commands.push(here());
          Object.assign(sent_, { x: pointer.x, y: pointer.y });
          cursorTrack.push([n / fps, round(pointer.x), round(pointer.y)]);
        }
        for (const act of acts) {
          const aimed = seen.aim && state.aim === act.plan;
          if (aimed) act.aim = { x: seen.aim.x, y: seen.aim.y };
          if (n === (act.G ?? act.A) && act.plan !== undefined) {
            if (aimed && seen.aim.rect) rows[act.step].rect = seen.aim.rect;
            if (act.G !== undefined)
              rows[act.step].point = { x: round(pointer.x), y: round(pointer.y) };
          }
          if (!cued.includes(act)) continue;
          const why = await act.check?.(n);
          if (why) miss(act.step, why);
          commands.push(...(act.cue?.(n, pointer) || []));
          // A scroll moves the page under a pointer that stands still: tell the page where it is.
          if (act.scrolls?.length && n === act.A && act.G === undefined && pointer.shown && inside)
            commands.push(here());
        }
        if (scrollTrack.at(-1)?.[1] !== seen.scrollY) scrollTrack.push([n / fps, seen.scrollY]);
        for (const [method, params] of commands) {
          discrete ||= /** @type {any} */ (params).type !== 'mouseMoved';
          sent.push(tab.session.send(method, params));
        }
      };
      // First what is already going on — a click let go, a last key — then the steps that
      // start on this frame, which see the page as those left it.
      acts = acts.filter((act) => n <= Math.max(act.E, act.A));
      await play(acts);
      const fresh = [];
      let began = false;
      for (; next < spans.length && spans[next].S <= n; began = true) {
        const act = await beginStep(playing, next++);
        if (act) fresh.push(act);
      }
      acts.push(...fresh);
      if (began) await play(fresh);
      return { sent, discrete };
    },
    track: () => ({ steps: rows, cursor: cursorTrack, scroll: scrollTrack }),
  };
}
