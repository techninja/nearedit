/**
 * What NearEdit knows about a file: the analysis badges of the media bin
 * and plain-language summaries of analysis jobs and missing providers.
 * Outcomes and status shapes: docs/app-spec/INTELLIGENCE.md. Pure.
 * @module utils/media/analysis
 */

/** @typedef {import('./library.js').MediaItem} MediaItem */

/**
 * @typedef {Object} AnalysisKind
 * @property {string} key - Field of `MediaItem.analysis`
 * @property {string} step - Step name of POST /intelligence/analyze
 * @property {string} label
 * @property {string} icon - Key of src/icons.json
 * @property {'transcription'|'vision'|''} provider - Capability the step needs
 */

/** @type {AnalysisKind[]} */
export const ANALYSIS_KINDS = [
  {
    key: 'transcript',
    step: 'transcribe',
    label: 'Transcript',
    icon: 'mic',
    provider: 'transcription',
  },
  { key: 'tags', step: 'tags', label: 'Visual tags', icon: 'scan', provider: 'vision' },
  { key: 'scenes', step: 'scenes', label: 'Scenes', icon: 'clapperboard', provider: '' },
  { key: 'beats', step: 'beats', label: 'Beats', icon: 'beat', provider: '' },
  { key: 'silences', step: 'silence', label: 'Silences', icon: 'waveform', provider: '' },
];

const STEP_LABELS = {
  probe: 'Reading file details',
  transcribe: 'Transcription',
  tags: 'Visual tagging',
  scenes: 'Scene detection',
  beats: 'Beat detection',
  silence: 'Silence detection',
};

/**
 * The analyses that make sense for a file (no beats on a still image).
 * @param {MediaItem} item
 * @returns {AnalysisKind[]}
 */
export function applicableKinds(item) {
  const sound = item.type === 'audio' || (item.type === 'video' && item.hasAudio);
  /** @type {Record<string, boolean>} */
  const suits = {
    transcript: sound,
    beats: sound,
    silences: sound,
    scenes: item.type === 'video',
    tags: item.type === 'video' || item.type === 'image',
  };
  return ANALYSIS_KINDS.filter((kind) => suits[kind.key]);
}

/**
 * Badges for one file: each applicable analysis and whether it is done.
 * @param {MediaItem} item
 * @param {Record<string, { available?: boolean, detail?: string }>|null} [status] -
 *   GET /intelligence/status, when known
 * @returns {{ key: string, label: string, icon: string,
 *   state: 'done'|'missing'|'unavailable', title: string }[]}
 */
export function analysisBadges(item, status = null) {
  return applicableKinds(item).map(({ key, label, icon, provider }) => {
    if (item.analysis?.[key]) return { key, label, icon, state: 'done', title: `${label}: ready` };
    const blocked = provider && status && status[provider]?.available === false;
    return blocked
      ? { key, label, icon, state: 'unavailable', title: `${label}: no provider available` }
      : { key, label, icon, state: 'missing', title: `${label}: not analysed yet` };
  });
}

/**
 * Providers that are not usable, in words a person can act on.
 * @param {Record<string, { provider?: string, available?: boolean, detail?: string }>|null} status
 * @returns {{ capability: string, message: string }[]} Empty when all is well (or unknown)
 */
export function providerProblems(status) {
  if (!status) return [];
  const checks = [
    ['ffmpeg', 'FFmpeg', 'Nothing can be analysed without FFmpeg'],
    ['transcription', 'Transcription', 'Speech will not be transcribed'],
    ['vision', 'Visual tagging', 'Pictures will not be tagged or described'],
  ];
  return checks
    .filter(([key]) => status[key] && status[key].available === false)
    .map(([key, capability, effect]) => ({
      capability,
      message: `${effect}: ${status[key].detail || 'no provider is configured'}.`,
    }));
}

/**
 * Turn an analyze job's result into a headline and the problems worth
 * reading: skipped steps (with the reason, once) and failures.
 * @param {{ files?: { path: string, steps: Record<string, string> }[] }} result
 * @returns {{ headline: string, problems: string[], failed: number }}
 */
export function summarizeAnalysis(result) {
  const files = result?.files || [];
  /** @type {Map<string, number>} */
  const skipped = new Map();
  const problems = [];
  let failed = 0;
  for (const file of files) {
    for (const [step, outcome] of Object.entries(file.steps || {})) {
      const label = STEP_LABELS[step] || step;
      if (outcome.startsWith('skipped:')) {
        const text = `${label} skipped — ${outcome.slice(8).trim()}`;
        skipped.set(text, (skipped.get(text) || 0) + 1);
      } else if (outcome.startsWith('error')) {
        failed++;
        const name = file.path.split(/[\\/]/).pop();
        problems.push(`${label} failed for ${name} — ${outcome.replace(/^error:?\s*/, '')}`);
      }
    }
  }
  for (const [text, count] of skipped) {
    problems.unshift(count > 1 ? `${text} (${count} files)` : text);
  }
  const plural = files.length === 1 ? 'file' : 'files';
  const notes = skipped.size
    ? `, ${skipped.size} step${skipped.size === 1 ? '' : 's'} skipped`
    : '';
  const failures = failed ? `, ${failed} step${failed === 1 ? '' : 's'} failed` : '';
  const headline = `Analysed ${files.length} ${plural}${failures}${notes}`;
  return { headline, problems, failed };
}
