/**
 * What a project's media folder holds and how much of it has been
 * analysed, computed from the media list (`GET /api/media`). Pure.
 * Which step suits which file: docs/app-spec/INTELLIGENCE.md § Steps.
 * @module utils/projects/coverage
 */

/** @typedef {import('#utils/media/library.js').MediaItem} MediaItem */
/**
 * @typedef {Object} CoverageRow
 * @property {string} key
 * @property {string} label
 * @property {string} hint - What the result is used for
 * @property {number} done
 * @property {number} total - Files the step applies to
 * @property {string} [provider] - Key of the provider status the step depends on
 */

const hasSound = (/** @type {MediaItem} */ item) =>
  item.type === 'audio' || (item.type === 'video' && item.hasAudio);
const hasPicture = (/** @type {MediaItem} */ item) =>
  item.type === 'video' || item.type === 'image';
const isVideo = (/** @type {MediaItem} */ item) => item.type === 'video';

/** @type {{ key: string, label: string, hint: string, provider?: string, applies: (item: MediaItem) => boolean, done: (item: MediaItem) => boolean }[]} */
const STEPS = [
  {
    key: 'probe',
    label: 'Indexed',
    hint: 'Length, size and streams of every file',
    applies: () => true,
    done: (item) => item.indexed,
  },
  {
    key: 'scenes',
    label: 'Shots',
    hint: 'Shot boundaries, for cutting b-roll',
    applies: isVideo,
    done: (item) => Boolean(item.analysis?.scenes),
  },
  {
    key: 'silences',
    label: 'Silences',
    hint: 'Pauses, for removing dead air',
    applies: hasSound,
    done: (item) => Boolean(item.analysis?.silences),
  },
  {
    key: 'beats',
    label: 'Beats',
    hint: 'Tempo and beat positions, for cutting to music',
    applies: hasSound,
    done: (item) => Boolean(item.analysis?.beats),
  },
  {
    key: 'transcript',
    label: 'Transcripts',
    hint: 'Word-level speech, for the transcript panel and captions',
    provider: 'transcription',
    applies: hasSound,
    done: (item) => Boolean(item.analysis?.transcript),
  },
  {
    key: 'tags',
    label: 'Descriptions',
    hint: 'What is seen, for finding b-roll',
    provider: 'vision',
    applies: hasPicture,
    done: (item) => Boolean(item.analysis?.tags),
  },
];

/**
 * Counts by kind and the total running time.
 * @param {MediaItem[]} items
 * @returns {{ total: number, video: number, audio: number, image: number, text: number,
 *   duration: number, size: number }}
 */
export function mediaOverview(items) {
  const overview = { total: 0, video: 0, audio: 0, image: 0, text: 0, duration: 0, size: 0 };
  for (const item of Array.isArray(items) ? items : []) {
    overview.total++;
    if (item.type in overview) overview[item.type]++;
    overview.duration += Number(item.duration) || 0;
    overview.size += Number(item.size) || 0;
  }
  return overview;
}

/**
 * How far each analysis step has got. Steps that apply to no file of the
 * project are left out.
 * @param {MediaItem[]} items
 * @returns {CoverageRow[]}
 */
export function analysisCoverage(items) {
  const list = Array.isArray(items) ? items : [];
  return STEPS.map(({ key, label, hint, provider, applies, done }) => {
    const relevant = list.filter(applies);
    return {
      key,
      label,
      hint,
      provider,
      total: relevant.length,
      done: relevant.filter(done).length,
    };
  }).filter((row) => row.total > 0);
}

/**
 * Whether there is analysis left that the configured providers could do.
 * @param {CoverageRow[]} rows
 * @param {Record<string, { available?: boolean }>} [status] - Provider status; rows whose
 *   provider is not available cannot progress and are not counted
 * @returns {boolean}
 */
export function analysisPending(rows, status = {}) {
  return rows.some(
    (row) => row.done < row.total && (!row.provider || status[row.provider]?.available !== false),
  );
}

/**
 * @param {CoverageRow} row
 * @returns {number} 0..100
 */
export const coveragePercent = (row) => (row.total ? Math.round((row.done / row.total) * 100) : 0);
