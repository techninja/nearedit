/**
 * whisper.cpp provider — fully local, CPU-friendly. Runs the `whisper-cli`
 * executable on a 16 kHz WAV and reads its full JSON output (token-level
 * timestamps, merged into words by whisperCppParse.js).
 * @module api/intelligence/transcription/whisperCpp
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { jsonrepair } from 'jsonrepair';
import { extractSpeechAudio, withTempDir } from './audio.js';
import { parseWhisperCppJson } from './whisperCppParse.js';
import { parseJsonLoose } from '../http.js';

/**
 * Locate the ggml model: an explicit file, `ggml-<model>.bin` inside an
 * explicit directory, or `<data dir>/models/ggml-<model>.bin`.
 * @param {import('../settings.js').Settings} settings
 * @returns {string} '' when no model file exists
 */
export function findModel(settings) {
  const { whisperCppModelPath: configured, model } = settings.transcription;
  const name = `ggml-${model}.bin`;
  const candidates = [];
  if (configured && existsSync(configured)) {
    candidates.push(statSync(configured).isDirectory() ? join(configured, name) : configured);
  }
  candidates.push(join(settings.dataDir, 'models', name));
  return candidates.find((path) => existsSync(path)) || '';
}

/**
 * Command line for one transcription.
 * @param {{ model: string, wav: string, outBase: string, language?: string }} job
 * @returns {string[]}
 */
export function whisperCppArgs({ model, wav, outBase, language }) {
  // -ojf: full JSON with per-token timing, -of: output path without ".json",
  // -np: results only, -pp: progress lines on stderr. The CLI defaults to
  // English, so auto-detection has to be requested explicitly.
  return ['-m', model, '-f', wav, '-l', language || 'auto', '-ojf', '-of', outBase, '-np', '-pp'];
}

/**
 * @param {import('../settings.js').Settings} settings
 * @param {import('../steps/types.js').Deps} deps
 * @returns {import('./index.js').TranscribeProvider}
 */
export function createWhisperCpp(settings, deps) {
  const bin = settings.transcription.whisperCppBin;

  return {
    name: 'whisper-cpp',

    async available() {
      const model = findModel(settings);
      if (!model) {
        const hint = 'set WHISPER_CPP_MODEL_PATH to a ggml-*.bin model file';
        return { available: false, detail: `no model found: ${hint}` };
      }
      try {
        await deps.run(bin, ['--help'], { timeout: 3000 });
        return { available: true, detail: `${bin} with ${basename(model)}` };
      } catch (err) {
        const missing = err.code === 'ENOENT';
        return { available: false, detail: missing ? `${bin} not found on PATH` : err.message };
      }
    },

    async transcribe(filePath, options = {}) {
      const model = findModel(settings);
      if (!model) throw new Error('whisper.cpp model file not found');
      return withTempDir(async (dir) => {
        const wav = await extractSpeechAudio(deps.run, filePath, join(dir, 'audio.wav'), options);
        const outBase = join(dir, 'transcript');
        const args = whisperCppArgs({ model, wav, outBase, language: options.language });
        await deps.run(bin, args, {
          signal: options.signal,
          onStderr: (line) => {
            const match = /progress\s*=\s*(\d+)%/.exec(line);
            if (match) options.onProgress?.(Number(match[1]) / 100);
          },
        });
        const text = readFileSync(`${outBase}.json`, 'utf-8');
        return parseWhisperCppJson(parseJsonLoose(text, jsonrepair));
      });
    },
  };
}
