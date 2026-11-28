/**
 * The web clips of a standalone document. Their recordings live beside the
 * document, in `.nearedit/web/`, under the key of the recipe. Loading a
 * document attaches the recordings that exist and says which are missing
 * and what is wrong with a recipe — without starting a browser; `render`
 * and `frame` make the missing ones first (`webMissing.js`).
 * Reference: docs/app-spec/WEBCLIP.md § Command line.
 * @module bin/lib/webClips
 */

import { setWebRecording, webClips } from '#utils/edl/index.js';
import { recipeKey, validateRecipe } from '#utils/web/index.js';
import { readRecording } from '../../src/api/web/recordings.js';

/** @typedef {import('./repairs.js').Finding} Finding */
/** @typedef {{ clipId: string, key: string, recipe: any }} Unrecorded */

/**
 * What is wrong with the recipes of a document, as they were written.
 * @param {any[]} tracks - The raw `tracks`
 * @returns {Finding[]} Errors, with paths like `tracks[0].clips[1].web.recipe.steps[2].target`
 */
export function recipeFindings(tracks) {
  /** @type {Finding[]} */
  const findings = [];
  tracks.forEach((track, t) => {
    (Array.isArray(track?.clips) ? track.clips : []).forEach((clip, c) => {
      const recipe = clip?.web?.recipe;
      if (!recipe || typeof recipe !== 'object') return;
      const at = `tracks[${t}].clips[${c}].web.recipe`;
      for (const { path, message } of validateRecipe(recipe).problems)
        findings.push({ path: path ? `${at}.${path}` : at, level: 'error', message });
    });
  });
  return findings;
}

/**
 * Point every web clip at its recording — beside the document or in one of
 * the `--media` folders (a project folder keeps its recordings the same
 * way) — or, when there is none yet, leave it a placeholder and say so.
 * @param {any} edl - Normalised
 * @param {string} dir - The document's folder
 * @param {string[]} [folders] - The `--media` folders
 * @returns {{ edl: any, unrecorded: Unrecorded[] }}
 */
export function attachRecordings(edl, dir, folders = []) {
  /** @type {Unrecorded[]} */
  const unrecorded = [];
  let out = edl;
  for (const { clip } of webClips(edl)) {
    const key = recipeKey(clip.web.recipe, edl.fps);
    const recording = [dir, ...folders].map((at) => readRecording(at, key)).find(Boolean);
    if (recording) {
      out = setWebRecording(out, clip.clipId, recording);
      continue;
    }
    unrecorded.push({ clipId: clip.clipId, key, recipe: clip.web.recipe });
    // Whatever file the document names belongs to another recipe, or is not here.
    const blank = (/** @type {any} */ one) =>
      one.clipId === clip.clipId ? { ...one, sourceFile: '', placeholder: true } : one;
    out = {
      ...out,
      tracks: out.tracks.map((track) => ({ ...track, clips: track.clips.map(blank) })),
    };
  }
  return { edl: out, unrecorded };
}

/**
 * Say which web clips still have to be recorded.
 * @param {any} edl - As `attachRecordings` returned it
 * @param {Unrecorded[]} unrecorded
 * @returns {Finding[]} Warnings: `render` and `frame` record them first
 */
export function unrecordedFindings(edl, unrecorded) {
  const ids = new Set(unrecorded.map((entry) => entry.clipId));
  /** @type {Finding[]} */
  const findings = [];
  edl.tracks.forEach((/** @type {any} */ track, /** @type {number} */ t) => {
    track.clips.forEach((/** @type {any} */ clip, /** @type {number} */ c) => {
      if (!ids.has(clip.clipId)) return;
      const message = 'web clip not recorded yet: "nearedit render" and "frame" record it first';
      findings.push({ path: `tracks[${t}].clips[${c}].web`, level: 'warning', message });
    });
  });
  return findings;
}
