/**
 * Intelligence settings: the shared server config plus a few provider knobs
 * that only this folder needs. All are documented in
 * docs/app-spec/CONFIGURATION.md.
 * @module api/intelligence/settings
 */

import { getConfig } from '../lib/config.js';

/**
 * Read the configuration at use time (tests change the environment).
 * @returns {ReturnType<typeof getConfig> & { transcription: ReturnType<typeof getConfig>['transcription'] & {
 *   device: string, computeType: string, remoteModel: string, chunkSeconds: number } }}
 */
export function getSettings() {
  const env = process.env;
  const config = getConfig();
  const chunkSeconds = Number(env.TRANSCRIBE_CHUNK_SECONDS);
  return {
    ...config,
    transcription: {
      ...config.transcription,
      // faster-whisper: auto | cpu | cuda, and a CTranslate2 compute type
      device: env.FASTER_WHISPER_DEVICE || 'auto',
      computeType: env.FASTER_WHISPER_COMPUTE_TYPE || 'default',
      // openai provider: model name when it differs from the local WHISPER_MODEL
      remoteModel: env.TRANSCRIBE_MODEL || '',
      // openai provider: longest piece of audio sent in one request
      chunkSeconds: chunkSeconds >= 30 ? chunkSeconds : 600,
    },
  };
}

/** @typedef {ReturnType<typeof getSettings>} Settings */
