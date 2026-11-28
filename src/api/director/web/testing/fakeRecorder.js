/**
 * A stand-in for the web clip recorder, for tests that must not depend on
 * a browser: snapshots answered from data, and "recordings" that are a
 * real (tiny, blank) video of the recipe's length with the track the score
 * predicts — each step's rectangle where the page data puts its target.
 * What is asked of it is written down. Not part of the runtime.
 * @module api/director/web/testing/fakeRecorder
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { compileScore, normalizeRecipe, recipeKey } from '#utils/web/index.js';
import { recordingPaths, webDir } from '../../../web/recordings.js';
import { pageAfter } from './page.js';

/**
 * Where a target shows once the page has brought it into view.
 * @param {any} target
 * @param {any[]} elements
 * @param {{ width: number, height: number }} viewport
 * @returns {{ x: number, y: number, width: number, height: number }|undefined}
 */
function shown(target, elements, viewport) {
  const rect = elements.find((element) => element.target === target)?.rect;
  if (!rect) return undefined;
  const fits = rect.y + rect.height <= viewport.height;
  const y = fits ? rect.y : Math.max(0, (viewport.height - rect.height) / 2);
  return { ...rect, y };
}

/**
 * @param {{ page?: typeof pageAfter, available?: boolean, reason?: string }} [options] -
 *   `page`: what is on the page after some steps; `available: false` plays a
 *   machine without a browser
 * @returns {{ status: any, snapshot: any, record: any, looks: any[], recordings: any[] }}
 *   The three parts `siteDemo` takes, and what was asked of them
 */
export function fakeRecorder({ page = pageAfter, available = true, reason = '' } = {}) {
  /** @type {any[]} */
  const looks = [];
  /** @type {any[]} */
  const recordings = [];
  return {
    looks,
    recordings,
    status: async () => ({
      available,
      browser: { path: available ? '/fake/chrome-headless-shell' : '', version: 'fake' },
      reason: available
        ? ''
        : reason || 'No chrome-headless-shell was found. Run "npm run install-browser".',
      allow: [],
    }),
    async snapshot({ recipe }) {
      looks.push(recipe);
      const normal = normalizeRecipe(recipe);
      const { title, height, elements } = page(normal);
      const size = { width: normal.viewport.width, height };
      return {
        ...{ url: normal.url, title, viewport: normal.viewport, page: size, scrollY: 0 },
        ...{ image: '', elements, warnings: [] },
      };
    },
    async record({ folder, recipe, fps, signal, onFrame }) {
      const normal = normalizeRecipe(recipe);
      const score = compileScore(normal, fps);
      const key = recipeKey(normal, score.fps);
      const { file, trackPath } = recordingPaths(folder, key);
      const cached = existsSync(file);
      recordings.push({ recipe: normal, key, cached });
      for (const done of [1, Math.ceil(score.frames / 2), score.frames]) {
        signal?.throwIfAborted();
        onFrame?.(done, score.frames);
      }
      const steps = score.steps.map((at) => {
        const step = normal.steps[at.index];
        const target = step.do === 'scroll' ? step.to : step.target;
        const { elements } = page({ ...normal, steps: normal.steps.slice(0, at.index) });
        const rect =
          typeof target === 'string' ? shown(target, elements, normal.viewport) : undefined;
        const missing =
          Boolean(target) && typeof target === 'string' && !rect && !/^(top|bottom)$/.test(target);
        return {
          ...at,
          missing,
          ...(target !== undefined && target !== '' && { target }),
          ...(rect && { rect }),
        };
      });
      const { title } = page(normal);
      const size = {
        width: normal.viewport.width * normal.scale,
        height: normal.viewport.height * normal.scale,
      };
      const warnings = steps
        .filter((step) => step.missing)
        .map(
          (step) => `Step ${step.index + 1} (${step.do}): nothing matches ${step.target} — skipped`,
        );
      const track = {
        ...{ version: 1, key, url: normal.url, title, fps: score.fps, duration: score.duration },
        ...{ viewport: normal.viewport, scale: normal.scale, ...size },
        ...{ steps, cursor: [], scroll: [], warnings },
      };
      if (!cached) {
        mkdirSync(webDir(folder), { recursive: true });
        const blank = `color=c=white:s=64x36:r=${score.fps}:d=${score.duration}`;
        const quiet = ['-v', 'error', '-y', '-f', 'lavfi', '-i', blank];
        execFileSync('ffmpeg', [
          ...quiet,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-pix_fmt',
          'yuv420p',
          file,
        ]);
        writeFileSync(trackPath, JSON.stringify(track));
      }
      const { duration } = score;
      return { file, key, duration, fps: score.fps, ...size, title, track, cached };
    },
  };
}
