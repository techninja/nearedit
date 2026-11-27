/**
 * Turns `GET /api/intelligence/status` into what the project page shows:
 * one row per capability, what it is for, and where to read about setting
 * it up when it is missing. Pure.
 * @module utils/projects/providers
 */

/**
 * @typedef {Object} ProviderRow
 * @property {string} key - ffmpeg | transcription | vision | llm
 * @property {string} label
 * @property {boolean} available
 * @property {boolean} required - The app cannot work without it
 * @property {string} value - What is in use, e.g. "ollama · qwen3:14b"
 * @property {string} detail - The server's explanation (version, or why it is unavailable)
 * @property {string} purpose - What it enables
 * @property {string} setup - How to set it up (shown when unavailable)
 * @property {string} docs - Where the setup is documented, a path in the repository
 */

const INFO = {
  ffmpeg: {
    label: 'FFmpeg',
    required: true,
    purpose: 'Previews, waveforms, analysis and rendering',
    setup: 'Install FFmpeg on the server and make sure `ffmpeg` and `ffprobe` are on its PATH.',
    docs: 'README.md',
  },
  transcription: {
    label: 'Transcription',
    required: false,
    purpose: 'Word-level transcripts: tightening speech, captions, the transcript panel',
    setup: 'Set TRANSCRIBE_PROVIDER (whisper-cpp, faster-whisper, openai or ssh).',
    docs: 'docs/app-spec/INTELLIGENCE.md § Transcription',
  },
  vision: {
    label: 'Visual tagging',
    required: false,
    purpose: 'Descriptions of footage and stills, so the director can find b-roll',
    setup: 'Set VISION_PROVIDER (ollama or openai) and VISION_MODEL.',
    docs: 'docs/app-spec/INTELLIGENCE.md § Visual tagging',
  },
  llm: {
    label: 'Director LLM',
    required: false,
    purpose:
      'Prompted edits and scripts. Base edit, silence removal, beat sync and captions work without it',
    setup: 'Set LLM_PROVIDER (ollama or openai), LLM_URL and LLM_MODEL.',
    docs: 'docs/app-spec/CONFIGURATION.md § Director LLM',
  },
};

/**
 * @param {any} entry - One entry of the status response
 * @returns {string}
 */
function inUse(entry) {
  const provider = entry?.provider && entry.provider !== 'none' ? entry.provider : '';
  return [provider, provider && entry.model].filter(Boolean).join(' · ');
}

/**
 * @param {any} status - Response of `GET /api/intelligence/status`; null while unknown
 * @returns {ProviderRow[]} Empty while the status is unknown
 */
export function providerRows(status) {
  if (!status || typeof status !== 'object') return [];
  return Object.entries(INFO).map(([key, info]) => {
    const entry = status[key] || {};
    const available = entry.available === true;
    const value = key === 'ffmpeg' ? (available ? entry.detail || '' : '') : inUse(entry);
    const detail = key === 'ffmpeg' && available ? '' : entry.detail || '';
    return { key, ...info, available, value, detail };
  });
}

/**
 * One line that sums up the setup.
 * @param {ProviderRow[]} rows
 * @returns {{ ok: boolean, text: string }} `ok` is false only when something required is missing
 */
export function setupSummary(rows) {
  if (!rows.length) return { ok: true, text: '' };
  const missing = rows.filter((row) => !row.available);
  const blocking = missing.filter((row) => row.required);
  if (blocking.length)
    return {
      ok: false,
      text: `${blocking.map((row) => row.label).join(', ')} is missing — nothing can be analysed or rendered`,
    };
  if (!missing.length) return { ok: true, text: 'Everything is set up' };
  const names = missing.map((row) => row.label).join(', ');
  return { ok: true, text: `Ready to edit. Optional and not set up: ${names}` };
}
