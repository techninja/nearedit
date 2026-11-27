/**
 * How long each scene of a motion piece is, in whole frames. A scene lasts
 * as long as its words take to read at the chosen pacing (or as long as the
 * plan says); with a target length every scene is scaled by the same factor
 * and the frames are shared out so the piece ends exactly on the target.
 * Reference: docs/app-spec/DIRECTOR-MOTION.md § Timing.
 * @module api/director/motion/timing
 */

import { formatSeconds } from '#utils/director/snap.js';

/**
 * Seconds per scene: `base` to take the picture in, `perWord` to read, kept
 * within `min`..`max`; `transition` is the length of a fade or wipe.
 */
export const PACE = {
  slow: { base: 3.2, perWord: 0.42, min: 3.2, max: 12, transition: 0.8 },
  medium: { base: 2.4, perWord: 0.3, min: 2.4, max: 9, transition: 0.6 },
  fast: { base: 1.5, perWord: 0.22, min: 1.5, max: 6, transition: 0.4 },
};

/** No scene is shorter than this many seconds: text needs a moment. */
export const MIN_SCENE = 1;

/**
 * @param {string} [text]
 * @returns {number} Words in a text
 */
export const wordCount = (text) => (String(text || '').match(/\S+/g) || []).length;

/**
 * The length a scene asks for.
 * @param {{ title: string, subtitle?: string, duration?: number }} scene
 * @param {keyof typeof PACE} pacing
 * @returns {number} Seconds
 */
export function naturalSeconds(scene, pacing) {
  if (scene.duration > 0) return Math.max(MIN_SCENE, scene.duration);
  const pace = PACE[pacing] || PACE.medium;
  const words = wordCount(scene.title) + wordCount(scene.subtitle);
  return Math.min(pace.max, Math.max(pace.min, pace.base + pace.perWord * words));
}

/**
 * Share a number of frames between scenes in proportion to their weights,
 * exactly, with a floor per scene.
 * @param {number[]} weights
 * @param {number} total - Frames to hand out
 * @param {number} floor - Fewest frames a scene may get
 * @returns {number[]}
 */
export function shareFrames(weights, total, floor) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const exact = weights.map((weight) => (weight / sum) * total);
  const frames = exact.map((value) => Math.max(floor, Math.floor(value)));
  let spare = total - frames.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((value, i) => ({ i, part: value - Math.floor(value) }))
    .sort((a, b) => b.part - a.part || a.i - b.i);
  for (let k = 0; spare > 0; k++, spare--) frames[byRemainder[k % frames.length].i]++;
  // Floors may have used more than there was: take it back from the longest scenes.
  while (spare < 0) {
    const longest = frames.indexOf(Math.max(...frames));
    if (frames[longest] <= floor) break;
    frames[longest]--;
    spare++;
  }
  return frames;
}

/**
 * Scene lengths in frames.
 * @param {{ title: string, subtitle?: string, duration?: number }[]} scenes
 * @param {{ fps: number, pacing: string, target?: number }} opts - `target`
 *   in seconds; 0 or absent lets the scenes take what they ask for
 * @returns {{ frames: number[], notes: string[] }}
 */
export function sceneFrames(scenes, { fps, pacing, target = 0 }) {
  const natural = scenes.map((scene) => naturalSeconds(scene, /** @type {any} */ (pacing)));
  const floor = Math.round(MIN_SCENE * fps);
  const notes = [];
  if (!(target > 0)) {
    return { frames: natural.map((s) => Math.max(floor, Math.round(s * fps))), notes };
  }
  const asked = natural.reduce((a, b) => a + b, 0);
  const frames = shareFrames(natural, Math.round(target * fps), floor);
  const got = frames.reduce((a, b) => a + b, 0) / fps;
  const count = `${scenes.length} scene${scenes.length === 1 ? '' : 's'}`;
  if (got > target + 0.5 / fps) {
    notes.push(
      `${count} need at least ${formatSeconds(got)} — the piece is longer than the ` +
        `${formatSeconds(target)} asked for. Use fewer lines for a shorter piece.`,
    );
  } else if (target > asked * 2.5) {
    notes.push(
      `${count} were stretched to fill ${formatSeconds(target)} (they read in about ` +
        `${formatSeconds(asked)}). Add lines to the brief for more scenes.`,
    );
  } else if (target < asked * 0.6) {
    notes.push(
      `${count} were shortened to fit ${formatSeconds(target)} (they read in about ` +
        `${formatSeconds(asked)}) — check that the text can still be read.`,
    );
  }
  return { frames, notes };
}

/**
 * Frames a fade or wipe between two scenes takes: the pacing's transition
 * length, but never more than three tenths of the shorter scene.
 * @param {string} kind - A transition name; `cut` takes no time
 * @param {number} beforeF - Length of the scene before, frames
 * @param {number} afterF - Length of the scene after
 * @param {{ fps: number, pacing: string }} opts
 * @returns {number}
 */
export function transitionFrames(kind, beforeF, afterF, { fps, pacing }) {
  if (kind === 'cut') return 0;
  const wanted = Math.round((PACE[pacing] || PACE.medium).transition * fps);
  return Math.max(2, Math.min(wanted, Math.floor(Math.min(beforeF, afterF) * 0.3)));
}
