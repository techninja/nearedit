/**
 * Server configuration — every environment variable is read here, once.
 * Call getConfig() at use time (not import time) so tests can override env.
 * All variables are documented in docs/app-spec/CONFIGURATION.md.
 * @module api/lib/config
 */

import { resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * Split a newline/comma/colon-free list of absolute paths.
 * @param {string|undefined} raw
 * @returns {string[]}
 */
function pathList(raw) {
  return (raw || '')
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => resolve(p));
}

/**
 * @typedef {Object} ProviderConfig
 * @property {string} provider - Provider key, 'none' disables the feature
 * @property {string} url - Base URL of the service (HTTP providers)
 * @property {string} model
 * @property {string} apiKey
 */

/**
 * Build the config object from the current environment.
 * @returns {{
 *   port: number, host: string, auth: { user: string, password: string },
 *   dataDir: string, rendersDir: string, previewsDir: string,
 *   transcodeDir: string, devMediaDir: string, registryPath: string,
 *   globalMediaPaths: string[], browseRoots: string[],
 *   llm: ProviderConfig, vision: ProviderConfig,
 *   transcription: ProviderConfig & { language: string, whisperCppBin: string,
 *     whisperCppModelPath: string, python: string, sshHost: string, sshCommand: string,
 *     publicUrl: string },
 *   jobs: { renderConcurrency: number, analysisConcurrency: number },
 * }}
 */
export function getConfig() {
  const env = process.env;
  const dataDir = resolve(env.NEAREDIT_DATA_DIR || resolve(process.cwd(), 'data'));
  const ollamaUrl = env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const port = parseInt(env.PORT || '', 10) || 3000;
  return {
    port,
    host: env.HOST || '', // empty = every interface, so phones on the LAN can connect
    auth: { user: env.NEAREDIT_USER || 'nearedit', password: env.NEAREDIT_PASSWORD || '' },
    dataDir,
    rendersDir: resolve(dataDir, 'renders'),
    previewsDir: resolve(dataDir, 'previews'),
    transcodeDir: resolve(dataDir, 'transcode'),
    registryPath: resolve(dataDir, 'registry.json'),
    devMediaDir: resolve(env.NEAREDIT_MEDIA_DIR || resolve(process.cwd(), 'media')),
    globalMediaPaths: pathList(env.GLOBAL_MEDIA_PATHS),
    browseRoots: pathList(env.BROWSE_ROOTS).length ? pathList(env.BROWSE_ROOTS) : [homedir()],
    llm: {
      provider: env.LLM_PROVIDER || 'ollama', // ollama | openai | none
      url: env.LLM_URL || ollamaUrl,
      model: env.LLM_MODEL || env.OLLAMA_MODEL || 'qwen3:14b',
      apiKey: env.LLM_API_KEY || '',
    },
    vision: {
      provider: env.VISION_PROVIDER || 'ollama', // ollama | openai | none
      url: env.VISION_URL || ollamaUrl,
      model: env.VISION_MODEL || 'llava:7b',
      apiKey: env.VISION_API_KEY || '',
    },
    transcription: {
      // auto | whisper-cpp | faster-whisper | openai | ssh | none
      provider: env.TRANSCRIBE_PROVIDER || 'auto',
      url: env.TRANSCRIBE_URL || '',
      model: env.WHISPER_MODEL || 'base',
      apiKey: env.TRANSCRIBE_API_KEY || '',
      language: env.TRANSCRIBE_LANGUAGE || '',
      whisperCppBin: env.WHISPER_CPP_BIN || 'whisper-cli',
      whisperCppModelPath: env.WHISPER_CPP_MODEL_PATH || '',
      python: env.FASTER_WHISPER_PYTHON || 'python3',
      sshHost: env.HYDRA_HOST || '',
      sshCommand: env.TRANSCRIBE_SSH_COMMAND || '',
      publicUrl: env.SERVER_HOST ? `http://${env.SERVER_HOST}:${port}` : '',
    },
    jobs: {
      renderConcurrency: parseInt(env.RENDER_CONCURRENCY || '', 10) || 1,
      analysisConcurrency: parseInt(env.ANALYSIS_CONCURRENCY || '', 10) || 1,
    },
  };
}
