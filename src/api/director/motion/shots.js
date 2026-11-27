/**
 * The schedule of a motion piece: where each scene starts and ends, how
 * long its transition in takes, which background row it lies on and when
 * its words come and go — all in whole frames.
 * @module api/director/motion/shots
 */

import { PACE, sceneFrames, transitionFrames } from './timing.js';

/**
 * @typedef {Object} Shot
 * @property {number} index
 * @property {any} scene - The plan's scene
 * @property {number} startF - First frame of the scene
 * @property {number} endF - Frame the next scene starts on
 * @property {number} inF - Frames its transition in takes (0 = cut)
 * @property {number} tailF - Frames its background stays on under the next scene's transition
 * @property {number} outF - Frames of the fade to nothing; only the last scene has one
 * @property {boolean} front - On the front background row (odd scenes)
 * @property {number} textF - Frame the title starts to arrive on
 * @property {number} textEndF - Frame by which the words are gone
 * @property {number} inSeconds - Time the title's entrance may take
 * @property {number} outSeconds - Length of the words' exit; 0 = they stay up to the cut
 */

/**
 * Schedule the scenes of a plan.
 * @param {any[]} scenes - Complete scenes (every choice made)
 * @param {{ fps: number, pacing: string, target?: number }} opts
 * @returns {{ shots: Shot[], totalF: number, notes: string[] }}
 */
export function schedule(scenes, opts) {
  const { fps } = opts;
  const { frames, notes } = sceneFrames(scenes, opts);
  const pace = PACE[opts.pacing] || PACE.medium;
  /** @type {Shot[]} */
  const shots = [];
  let at = 0;
  scenes.forEach((scene, index) => {
    const lengthF = frames[index];
    const beforeF = index ? frames[index - 1] : lengthF;
    shots.push({
      index,
      scene,
      startF: at,
      endF: at + lengthF,
      inF: transitionFrames(scene.transition, beforeF, lengthF, opts),
      tailF: 0,
      outF: 0,
      front: index % 2 === 1,
      textF: 0,
      textEndF: 0,
      inSeconds: 0,
      outSeconds: 0,
    });
    at += lengthF;
  });
  shots.forEach((shot, i) => {
    const next = shots[i + 1];
    const lengthF = shot.endF - shot.startF;
    shot.tailF = next ? next.inF : 0;
    shot.outF = next ? 0 : Math.min(Math.round(fps * 0.5), Math.floor(lengthF * 0.25));
    shot.textF = shot.startF + (shot.inF ? Math.round(shot.inF * 0.6) : Math.round(fps * 0.1));
    shot.textEndF = shot.endF - Math.round(shot.outF * 0.5);
    const seconds = (shot.textEndF - shot.textF) / fps;
    shot.inSeconds = Math.min(pace.transition * 1.5, seconds * 0.35);
    const cutAway = next && next.inF === 0;
    shot.outSeconds = cutAway ? 0 : Math.round(Math.min(0.4, seconds * 0.15) * fps) / fps;
  });
  return { shots, totalF: at, notes };
}
