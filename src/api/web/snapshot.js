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
 * Reduce a screenshot to one device pixel per CSS pixel: the picture is for
 * aiming at things, and a recipe's scale would make it four or nine times
 * the size.
 * @param {string} png - Base64, at the recipe's scale
 * @param {{ width: number, height: number }} viewport
 * @returns {Promise<string>} Base64
 */
async function atOneToOne(png, { width, height }) {
  const bytes = Buffer.from(png, 'base64');
  if (bytes.length > 24 && bytes.readUInt32BE(16) === width) return png;
  // Loaded late: most of the server never draws.
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(await loadImage(bytes), 0, 0, width, height);
  return canvas.toBuffer('image/png').toString('base64');
}

/**
 * @param {Omit<import('./studio.js').StudioOptions, 'fps'> & { until?: number, fps?: number,
 *   signal?: AbortSignal }} options - `recipe` may be raw; `until`: how many steps to play
 *   first (default: all); `fps`: the frame rate the clip will be recorded at (default 30)
 * @returns {Promise<{ url: string, title: string, viewport: { width: number, height: number },
 *   page: { width: number, height: number }, scrollY: number, image: string, elements: object[],
 *   warnings: string[] }>} `image` is a PNG data URL of the viewport at one device pixel per
 *   CSS pixel, without the recorder's pointer and marks
 * @throws {Error} As `recordRecipe`
 */
export async function takeSnapshot({ until, signal, ...options }) {
  // The page is driven exactly as a recording drives it — same scale, same frame rate — so
  // that what can be done here can be done there. Only the picture is made smaller.
  const recipe = normalizeRecipe(options.recipe);
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
    const png = await atOneToOne(await stepper.frame(true), recipe.viewport);
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
