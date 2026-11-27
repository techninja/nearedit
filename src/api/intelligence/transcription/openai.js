/**
 * OpenAI-compatible transcription provider: `POST /v1/audio/transcriptions`
 * with `verbose_json` and word + segment timestamps. Works with OpenAI,
 * Groq, LocalAI, speaches / faster-whisper-server and similar servers.
 * Audio is sent as 16 kHz mono FLAC, in chunks, so upload limits (25 MB on
 * the hosted APIs) are never an issue.
 * @module api/intelligence/transcription/openai
 */

import { openAsBlob } from 'node:fs';
import { join } from 'node:path';
import { extractSpeechAudio, withTempDir } from './audio.js';
import { mergeTranscripts, normalizeTranscript, planChunks } from './normalize.js';
import { bearer, ensureOk, hostOf, openAiUrl, ping } from '../http.js';

const DEFAULT_BASE = 'https://api.openai.com';
const LOCAL_SIZE = /^(tiny|base|small|medium|large|turbo|distil)([.-].*)?$/;
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Model name to send: `TRANSCRIBE_MODEL`, else `WHISPER_MODEL` unless that is
 * a local size name such as "base", which hosted APIs do not know.
 * @param {import('../settings.js').Settings['transcription']} cfg
 * @returns {string}
 */
export function remoteModel(cfg) {
  if (cfg.remoteModel) return cfg.remoteModel;
  return LOCAL_SIZE.test(cfg.model) ? 'whisper-1' : cfg.model;
}

/**
 * Wait, giving up early when the signal aborts.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(resolvePromise, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * @param {import('../settings.js').Settings} settings
 * @param {import('../steps/types.js').Deps} deps
 * @param {{ retryDelay?: number }} [tuning] - Base back-off in ms (tests shorten it)
 * @returns {import('./index.js').TranscribeProvider}
 */
export function createOpenAiTranscriber(settings, deps, tuning = {}) {
  const cfg = settings.transcription;
  const base = cfg.url || DEFAULT_BASE;
  const { retryDelay = 2000 } = tuning;

  /**
   * Upload one audio file, retrying rate limits and gateway errors.
   * @param {string} audioPath
   * @param {{ language?: string, signal?: AbortSignal }} options
   * @returns {Promise<any>} The verbose_json response
   */
  async function upload(audioPath, options) {
    for (let attempt = 0; ; attempt++) {
      const form = new FormData();
      form.append('file', await openAsBlob(audioPath, { type: 'audio/flac' }), 'audio.flac');
      form.append('model', remoteModel(cfg));
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      form.append('timestamp_granularities[]', 'segment');
      if (options.language) form.append('language', options.language);
      const res = await deps.fetch(openAiUrl(base, '/audio/transcriptions'), {
        method: 'POST',
        headers: bearer(cfg.apiKey),
        body: form,
        signal: options.signal,
      });
      if (RETRY_STATUS.has(res.status) && attempt < 2) {
        const wait = Number(res.headers.get('retry-after')) * 1000 || retryDelay * 2 ** attempt;
        await res.arrayBuffer().catch(() => null); // release the connection
        await sleep(Math.min(wait, 20_000), options.signal);
        continue;
      }
      return (await ensureOk(res, 'Transcription request')).json();
    }
  }

  return {
    name: 'openai',

    async available() {
      if (!cfg.url && !cfg.apiKey) {
        return { available: false, detail: 'TRANSCRIBE_URL (or TRANSCRIBE_API_KEY) is not set' };
      }
      const result = await ping(deps.fetch, openAiUrl(base, '/models'), {
        headers: bearer(cfg.apiKey),
      });
      // A server without a model list (404) is still a server that answered.
      const reachable = result.ok || result.status === 404;
      const detail = reachable ? `${remoteModel(cfg)} at ${hostOf(base)}` : result.detail;
      return { available: reachable, detail };
    },

    transcribe(filePath, options = {}) {
      return withTempDir(async (dir) => {
        const duration =
          options.duration || (await deps.probe(filePath, { signal: options.signal }))?.duration;
        if (!(duration > 0)) throw new Error('Could not determine the audio duration');
        const chunks = planChunks(duration, cfg.chunkSeconds, options.silences);
        const parts = [];
        for (const [index, chunk] of chunks.entries()) {
          const audio = join(dir, `chunk-${index}.flac`);
          await extractSpeechAudio(deps.run, filePath, audio, { ...chunk, signal: options.signal });
          parts.push(normalizeTranscript(await upload(audio, options), chunk.start));
          options.onProgress?.((index + 1) / chunks.length);
        }
        return mergeTranscripts(parts);
      });
    },
  };
}
