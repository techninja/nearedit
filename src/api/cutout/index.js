/**
 * The person cutout on the server: a matte program run over the frames of
 * a media file, picture and matte packed side by side into
 * `<folder>/.nearedit/cutout/<key>.mp4`, cached by key.
 * Contract: docs/app-spec/CUTOUT.md.
 *
 *   makeCutout({ folder, path, start, end, fps, signal?, onProgress? })
 *     → { file, key, source, start, end, fps, width, height, frames, cached }
 *   readCutout(folder, key) → the same for a cutout that exists, or null
 *   findCutout(folder, source, { start, end, fps, model }) → one that covers it, or null
 *   cutoutStatus({ fresh? }) → { available, provider, model, reason, … }
 *
 * @module api/cutout
 */

export {
  META_VERSION,
  cutoutDir,
  cutoutPaths,
  findCutout,
  readCutout,
  readMeta,
  sourceOf,
} from './files.js';
export { makeCutout } from './make.js';
export { STALL_MS, aborted, runPipeline } from './pipeline.js';
export { CRF, MAX_HEIGHT, MAX_WIDTH, matteSmoothing, pictureSize, planCutout } from './plan.js';
export {
  MODEL_FILE,
  MODELS_FOLDER,
  WORKER_SCRIPT,
  WORKER_SETTINGS,
  builtinProvider,
  findProvider,
  matteCommand,
  splitCommand,
} from './provider.js';
export { cutoutStatus, requireProvider } from './providerStatus.js';

/** @typedef {import('./files.js').Cutout} Cutout */
/** @typedef {import('./providerStatus.js').CutoutStatus} CutoutStatus */
