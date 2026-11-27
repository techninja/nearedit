/**
 * Shared shapes of the analysis pipeline. Every step is one object with the
 * same four questions: does it suit this file, is it already done, is its
 * provider usable, and what does running it add to the sidecar.
 * @module api/intelligence/steps/types
 */

import { run, probe } from '../../lib/ffmpeg.js';

/** @typedef {import('../../lib/sidecar.js').Sidecar & Record<string, any>} Sidecar */
/** @typedef {'video'|'audio'|'image'|'text'} MediaType */

/**
 * External effects a step may need — injectable so providers can be tested
 * without the real tools or services.
 * @typedef {Object} Deps
 * @property {typeof run} run - Process runner (argument arrays, no shell)
 * @property {typeof probe} probe - ffprobe wrapper
 * @property {typeof fetch} fetch
 */

/**
 * @typedef {Object} StepContext
 * @property {MediaType} type
 * @property {Sidecar|null} sidecar - Fresh sidecar when the step starts (null if none)
 * @property {Record<string, any>} options - Request options for this run (threshold, language…)
 * @property {AbortSignal} [signal]
 * @property {(fraction: number) => void} progress - 0..1 within this step
 * @property {(message: string) => void} log
 * @property {ReturnType<typeof import('../settings.js').getSettings>} settings
 * @property {Deps} deps
 */

/**
 * @typedef {Object} Availability
 * @property {boolean} available
 * @property {string} detail - Human-readable: a version, a provider name, or why not
 */

/**
 * @typedef {Object} Step
 * @property {string} name - probe | transcribe | tags | beats | scenes | silence
 * @property {string} jobType - Job type of the single-step route
 * @property {(type: MediaType, sidecar: Sidecar|null) => string} unsuitable
 *   Empty string when the step applies to this file, otherwise the reason
 * @property {(sidecar: Sidecar|null, options: Record<string, any>) => boolean} done
 *   True when a fresh sidecar already holds this step's result for these options
 * @property {(ctx: Pick<StepContext, 'settings'|'deps'>) => Promise<Availability>} [available]
 *   Only for steps that need an external provider
 * @property {(filePath: string, ctx: StepContext) => Promise<Record<string, any>>} run
 *   Resolves with the sidecar patch
 * @property {(patch: Record<string, any>) => Record<string, string|number|boolean|null>} summary
 *   Small scalar facts about a result, shown in job summaries
 */

/** @type {Deps} */
export const defaultDeps = { run, probe, fetch: (input, init) => fetch(input, init) };

/**
 * Round seconds to milliseconds.
 * @param {number} seconds
 * @returns {number}
 */
export const round3 = (seconds) => Math.round(seconds * 1000) / 1000;

/**
 * Build an FFmpeg stderr line handler that turns `-progress pipe:2` output
 * into a 0..1 fraction of a known duration.
 * @param {number|null|undefined} duration - Seconds
 * @param {(fraction: number) => void} onProgress
 * @returns {(line: string) => void}
 */
export function progressLines(duration, onProgress) {
  return (line) => {
    const match = /^out_time_(?:us|ms)=(\d+)/.exec(line);
    if (match && duration > 0) onProgress(Math.min(1, Number(match[1]) / 1e6 / duration));
  };
}
