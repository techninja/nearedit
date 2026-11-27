/**
 * Provider output fixtures in the real tools' wire formats.
 *
 * - WHISPER_CPP_FULL_JSON follows `output_json()` in whisper.cpp's
 *   examples/cli/cli.cpp (`-ojf`): field names, nesting and millisecond
 *   offsets are taken from that source; the numbers are illustrative.
 * - FASTER_WHISPER_STDOUT is trimmed real output of
 *   workers/faster_whisper_transcribe.py (model "tiny", JFK sample).
 * - OPENAI_VERBOSE_JSON follows the OpenAI `verbose_json` transcription
 *   response with word and segment timestamp granularities.
 * @module api/intelligence/testing/fixtures
 */

/**
 * One whisper.cpp token entry.
 * @param {string} text
 * @param {number} from - Milliseconds
 * @param {number} to
 * @param {number} id
 * @param {number} p
 * @returns {object}
 */
function token(text, from, to, id, p) {
  const stamp = (ms) => {
    const pad = (value, width = 2) => String(value).padStart(width, '0');
    const s = Math.floor(ms / 1000);
    return `00:${pad(Math.floor(s / 60))}:${pad(s % 60)},${pad(ms % 1000, 3)}`;
  };
  return {
    text,
    timestamps: { from: stamp(from), to: stamp(to) },
    offsets: { from, to },
    id,
    p,
    t_dtw: -1,
  };
}

export const WHISPER_CPP_FULL_JSON = {
  systeminfo: 'AVX = 1 | AVX2 = 1 | AVX512 = 0 | FMA = 1 | NEON = 0 | ',
  model: {
    type: 'base',
    multilingual: true,
    vocab: 51865,
    audio: { ctx: 1500, state: 512, head: 8, layer: 6 },
    text: { ctx: 448, state: 512, head: 8, layer: 6 },
    mels: 80,
    ftype: 1,
  },
  params: { model: 'models/ggml-base.bin', language: 'auto', translate: false },
  result: { language: 'en' },
  transcription: [
    {
      timestamps: { from: '00:00:00,000', to: '00:00:03,360' },
      offsets: { from: 0, to: 3360 },
      text: ' And so, my fellow Americans.',
      tokens: [
        token('[_BEG_]', 0, 0, 50363, 0.976),
        token(' And', 320, 510, 843, 0.726),
        token(' so', 510, 800, 370, 0.983),
        token(',', 800, 880, 11, 0.61),
        token(' my', 1100, 1320, 452, 0.99),
        token(' fellow', 1320, 1690, 7177, 0.998),
        token(' Amer', 1690, 2000, 3336, 0.95),
        token('icans', 2000, 2300, 26398, 0.99),
        token('.', 2300, 2360, 13, 0.8),
        token('[_TT_168]', 3360, 3360, 50531, 0.2),
      ],
    },
    {
      timestamps: { from: '00:00:03,360', to: '00:00:05,000' },
      offsets: { from: 3360, to: 5000 },
      text: ' [BLANK_AUDIO]',
      tokens: [
        token('[_BEG_]', 3360, 3360, 50363, 0.9),
        token(' [', 3360, 3500, 542, 0.4),
        token('BLANK', 3500, 4200, 4343, 0.5),
        token('_', 4200, 4300, 62, 0.9),
        token('AUDIO', 4300, 4900, 29937, 0.9),
        token(']', 4900, 5000, 60, 0.9),
      ],
    },
    {
      timestamps: { from: '00:00:05,000', to: '00:00:07,500' },
      offsets: { from: 5000, to: 7500 },
      text: " Ask what's 42.",
      tokens: [
        token(' Ask', 5000, 5400, 12320, 0.9),
        token(' what', 5400, 5800, 437, 0.94),
        token("'s", 5800, 5900, 311, 0.96),
        token(' 4', 6100, 6300, 1017, 0.7),
        token('2', 6300, 6500, 17, 0.9),
        token('.', 6500, 6540, 13, 0.85),
      ],
    },
  ],
};

export const FASTER_WHISPER_STDOUT =
  '{"language": "en", "language_probability": 0.9597, "duration": 11.0, "segments": [{"id": 0, ' +
  '"start": 0.0, "end": 10.48, "text": "And so, my fellow Americans, ask not", "words": [' +
  '{"word": "And", "start": 0.0, "end": 0.74, "probability": 0.745}, ' +
  '{"word": "so,", "start": 0.74, "end": 1.08, "probability": 0.883}, ' +
  '{"word": "my", "start": 1.12, "end": 1.34, "probability": 0.982}, ' +
  '{"word": "fellow", "start": 1.34, "end": 1.68, "probability": 0.998}, ' +
  '{"word": "Americans,", "start": 1.68, "end": 2.28, "probability": 0.967}, ' +
  '{"word": "ask", "start": 3.4, "end": 3.82, "probability": 0.898}, ' +
  '{"word": "not", "start": 3.82, "end": 4.56, "probability": 0.743}]}]}\n';

/**
 * An OpenAI `verbose_json` response for a short clip.
 * @param {string[]} words - One second per word, starting at 0
 * @returns {object}
 */
export function openAiVerboseJson(words) {
  return {
    task: 'transcribe',
    language: 'english',
    duration: words.length,
    text: words.join(' '),
    words: words.map((word, i) => ({ word, start: i, end: i + 0.8 })),
    segments: [
      {
        id: 0,
        seek: 0,
        start: 0,
        end: words.length,
        text: ` ${words.join(' ')}`,
        tokens: [50364, 440, 7534, 50514],
        temperature: 0,
        avg_logprob: -0.28,
        compression_ratio: 1.2,
        no_speech_prob: 0.01,
      },
    ],
  };
}
