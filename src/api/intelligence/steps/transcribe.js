/**
 * Transcribe step — speech to word-level timestamps through whichever
 * transcription provider is configured and usable.
 * @module api/intelligence/steps/transcribe
 */

import { resolveTranscriber } from '../transcription/index.js';
import { languageCode } from '../transcription/languages.js';
import { needsAudio } from './silence.js';

/** @typedef {import('./types.js').Step} Step */

/**
 * Resolve the provider once per job (the check may ping a server).
 * @param {Pick<import('./types.js').StepContext, 'settings'|'deps'|'cache'>} ctx
 * @returns {Promise<import('../transcription/index.js').ResolvedProvider>}
 */
function transcriber(ctx) {
  if (!ctx.cache.has('transcriber')) {
    ctx.cache.set('transcriber', resolveTranscriber(ctx.settings, ctx.deps));
  }
  return ctx.cache.get('transcriber');
}

/** @type {Step} */
export const transcribeStep = {
  name: 'transcribe',
  jobType: 'transcribe',
  unsuitable: needsAudio,

  done(sidecar, options) {
    if (!Array.isArray(sidecar?.transcript)) return false;
    return !options.language || languageCode(options.language) === sidecar.language;
  },

  async available(ctx) {
    const resolved = await transcriber(ctx);
    if (resolved.available)
      return { available: true, detail: `${resolved.name}: ${resolved.detail}` };
    // `auto` explains every provider it tried: too long to repeat per file.
    const brief =
      resolved.name === 'auto' ? 'none is usable' : `${resolved.name}: ${resolved.detail}`;
    return {
      available: false,
      detail: `no transcription provider (${brief})`,
      reason: `${resolved.name}: ${resolved.detail}`,
    };
  },

  async run(filePath, ctx) {
    const resolved = await transcriber(ctx);
    if (!resolved.provider) throw new Error(`No transcription provider: ${resolved.detail}`);
    const language = languageCode(ctx.options.language || ctx.settings.transcription.language);
    const result = await resolved.provider.transcribe(filePath, {
      language,
      signal: ctx.signal,
      onProgress: ctx.progress,
      duration: ctx.sidecar?.duration,
      silences: ctx.sidecar?.silences || [],
    });
    if (!result.words.length && result.segments.length) {
      ctx.log(`${resolved.name} returned no word timestamps; only segments were stored`);
    }
    return {
      transcript: result.words,
      segments: result.segments,
      language: result.language || language,
      transcriptProvider: resolved.name,
    };
  },

  summary: (patch) => ({
    words: patch.transcript.length,
    segments: patch.segments.length,
    language: patch.language,
    provider: patch.transcriptProvider,
  }),
};
