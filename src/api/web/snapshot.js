/**
 * A snapshot: the page as it stands after the first steps of a recipe,
 * with everything on it one can aim at. The steps are played exactly as a
 * recording plays them — same clock, same pointer — only no picture is
 * taken on the way, so it goes as fast as the browser does.
 * Contract: WEBCLIP.md § Server, `POST /web/snapshot`.
 * @module api/web/snapshot
 */

import { compileScore, normalizeRecipe } from '#utils/web/index.js';
import { aborted } from './errors.js';
import { createPerformer } from './performer.js';
import { explain } from './record.js';
import { openStudio } from './studio.js';

const MAX_ELEMENTS = 300;

/**
 * @param {Omit<import('./studio.js').StudioOptions, 'fps'> & { until?: number, fps?: number,
 *   signal?: AbortSignal }} options - `recipe` may be raw; `until`: how many steps to play
 *   first (default: all)
 * @returns {Promise<{ url: string, title: string, viewport: { width: number, height: number },
 *   page: { width: number, height: number }, scrollY: number, image: string, elements: object[],
 *   warnings: string[] }>} `image` is a PNG data URL of the viewport at one device pixel per
 *   CSS pixel, without the recorder's pointer and marks
 * @throws {Error} As `recordRecipe`
 */
export async function takeSnapshot({ until, signal, ...options }) {
  // One device pixel per CSS pixel: the picture is for aiming, and stays small.
  const recipe = { ...normalizeRecipe(options.recipe), scale: 1 };
  const score = compileScore(recipe, options.fps || 30);
  const wanted = Number.isFinite(until) ? Math.round(Number(until)) : score.steps.length;
  const steps = Math.max(0, Math.min(score.steps.length, wanted));
  const last = steps ? Math.round(score.steps[steps - 1].end * score.fps) : 0;
  if (signal?.aborted) throw aborted();
  /** @type {import('./studio.js').Studio|null} */
  let studio = null;
  const stop = () => void studio?.close();
  signal?.addEventListener('abort', stop, { once: true });
  try {
    studio = await openStudio({ ...options, recipe, fps: score.fps });
    const { tab, stepper } = studio;
    const stage = { tab, stepper, recipe, score, load: studio.load, warn: studio.warn };
    const performer = createPerformer(stage, steps);
    await studio.load(recipe.url, performer.rest);
    for (let n = 0; n <= last; n++) {
      if (signal?.aborted) throw aborted();
      studio.check();
      const { sent, discrete } = await performer.frame(n);
      await stepper.frame(false, discrete);
      await Promise.allSettled(sent);
    }
    await tab.call('frame', {}); // nothing of the recorder's in the picture
    const png = await stepper.frame(true);
    const facts = await tab.call('pageFacts');
    const elements = await tab.call('elements', MAX_ELEMENTS);
    return {
      ...{ url: facts.url, title: facts.title, viewport: recipe.viewport, page: facts.page },
      ...{ scrollY: facts.scrollY, image: `data:image/png;base64,${png}`, elements },
      warnings: studio.warnings(),
    };
  } catch (err) {
    throw explain(err, signal);
  } finally {
    signal?.removeEventListener('abort', stop);
    await studio?.close();
  }
}
