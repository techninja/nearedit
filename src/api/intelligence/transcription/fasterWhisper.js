/**
 * faster-whisper provider — runs workers/faster_whisper_transcribe.py with
 * the configured Python. Local; uses a GPU when CTranslate2 finds one.
 * @module api/intelligence/transcription/fasterWhisper
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSpeechAudio, withTempDir } from './audio.js';
import { normalizeTranscript } from './normalize.js';
import { parseJsonLoose } from '../http.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WORKER_SCRIPT = resolve(HERE, '../../../../workers/faster_whisper_transcribe.py');

// Looks the package up without importing it (importing loads CTranslate2 and
// takes seconds); exits 3 when it is not installed.
const CHECK = [
  'import importlib.util, importlib.metadata, sys',
  'sys.exit(3) if importlib.util.find_spec("faster_whisper") is None else None',
  'print(importlib.metadata.version("faster-whisper"))',
].join('\n');

/**
 * Command line for one transcription.
 * @param {import('../settings.js').Settings['transcription']} cfg
 * @param {string} audioPath
 * @param {string} [language]
 * @returns {string[]}
 */
export function fasterWhisperArgs(cfg, audioPath, language) {
  const args = [WORKER_SCRIPT, audioPath, '--model', cfg.model];
  args.push('--device', cfg.device, '--compute-type', cfg.computeType);
  if (language) args.push('--language', language);
  return args;
}

/**
 * @param {import('../settings.js').Settings} settings
 * @param {import('../steps/types.js').Deps} deps
 * @returns {import('./index.js').TranscribeProvider}
 */
export function createFasterWhisper(settings, deps) {
  const cfg = settings.transcription;

  return {
    name: 'faster-whisper',

    async available() {
      try {
        const { stdout } = await deps.run(cfg.python, ['-c', CHECK], { timeout: 5000 });
        return { available: true, detail: `faster-whisper ${stdout.trim()} (${cfg.python})` };
      } catch (err) {
        if (err.code === 'ENOENT') return { available: false, detail: `${cfg.python} not found` };
        const hint = `faster-whisper is not installed for ${cfg.python} (pip install faster-whisper)`;
        return { available: false, detail: err.code === 3 ? hint : err.message };
      }
    },

    transcribe(filePath, options = {}) {
      return withTempDir(async (dir) => {
        const wav = await extractSpeechAudio(deps.run, filePath, join(dir, 'audio.wav'), options);
        const { stdout } = await deps.run(
          cfg.python,
          fasterWhisperArgs(cfg, wav, options.language),
          {
            signal: options.signal,
            onStderr: (line) => {
              const match = /^PROGRESS ([\d.]+)/.exec(line);
              if (match) options.onProgress?.(Number(match[1]));
            },
          },
        );
        return normalizeTranscript(parseJsonLoose(stdout, (text) => text));
      });
    },
  };
}
