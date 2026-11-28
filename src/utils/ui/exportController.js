/**
 * Export dialog state: the presets, the chosen options, the server's plan
 * of what will be rendered, the running render and its result. Starting
 * and cancelling a render is in `exportRun.js`.
 * @module utils/ui/exportController
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import UserPrefs from '#store/UserPrefs.js';
import ViewState from '#store/ViewState.js';
import { api } from '#utils/api/http.js';
import { rememberSubtitles, rememberedSubtitles } from '#utils/captionsUi/exportSubtitles.js';
import { subtitleChoice } from '#utils/captionsUi/exportSubtitles.js';
import { getDoc } from '#utils/editor/session.js';
import { defaultFilename, rangeChoices, renderRequest } from '#utils/ui/exportPlan.js';
import { createObservable } from '#utils/ui/observable.js';

/**
 * @typedef {Object} ExportState
 * @property {string} adaptationId - The adaptation this state belongs to
 * @property {{ id: string, label: string, description: string }[]} presets
 * @property {string} preset
 * @property {'all'|'loop'} rangeId
 * @property {string} filename
 * @property {string} subtitles - The subtitle file a render saves beside the video: '', `srt`
 *   or `vtt`. Remembered on this computer, and kept from one adaptation to the next
 * @property {any} plan - `{ width, height, fps, duration, warnings }` from `/render/plan`; null = unknown
 * @property {string} planError - Why this cannot be rendered
 * @property {import('#utils/api/jobs.js').JobSummary|null} job - The running render
 * @property {boolean} starting - Saving and posting, before the job exists
 * @property {any} result - Result of the finished render; null = none
 * @property {string} error - Why the render failed
 * @property {string} saveWarning - The document could not be saved first
 */

const EMPTY = {
  adaptationId: '',
  presets: [],
  preset: 'standard',
  rangeId: /** @type {'all'|'loop'} */ ('all'),
  filename: '',
  subtitles: '',
  plan: null,
  planError: '',
  job: null,
  starting: false,
  result: null,
  error: '',
  saveWarning: '',
};

/** @type {import('#utils/ui/observable.js').Observable<ExportState>} */
export const exportState = createObservable({ ...EMPTY, subtitles: rememberedSubtitles() });

let planSerial = 0;

/** @returns {import('#utils/ui/exportPlan.js').RangeChoice[]} */
export const currentRanges = () => rangeChoices(getDoc(), store.get(ViewState));

/** @returns {Record<string, any>} The render request for the options as they stand */
export function exportRequest() {
  const { projectId, adaptationId } = store.get(ProjectState);
  const { preset, rangeId, filename, subtitles } = exportState.get();
  const ranges = currentRanges();
  const range = ranges.find((r) => r.id === rangeId && r.available) || ranges[0];
  const doc = getDoc();
  return renderRequest({ projectId, adaptationId, doc, preset, range, filename, subtitles });
}

/** Ask the server what the render would be (size, rate, length, warnings). */
export async function refreshPlan() {
  const serial = ++planSerial;
  exportState.set({ plan: null, planError: '' });
  try {
    const plan = await api('/render/plan', { body: exportRequest() });
    if (serial === planSerial) exportState.set({ plan });
  } catch (err) {
    const fields = Object.values(err.body?.fields || {}).join(' ');
    const planError = [err.message, fields || err.body?.detail].filter(Boolean).join(' — ');
    if (serial === planSerial) exportState.set({ planError });
  }
}

/** Prepare the dialog for the open adaptation. Call when it opens. */
export async function openExport() {
  const { adaptationId, adaptationName } = store.get(ProjectState);
  if (exportState.get().adaptationId !== adaptationId) {
    // A render of another adaptation carries on; the job tray shows it.
    const { presets, subtitles } = exportState.get();
    const filename = defaultFilename(adaptationName);
    exportState.set({ ...EMPTY, presets, subtitles, adaptationId, filename });
  }
  if (!currentRanges().find((r) => r.id === exportState.get().rangeId)?.available)
    exportState.set({ rangeId: 'all' });
  if (!exportState.get().presets.length) {
    try {
      const presets = (await api('/render/presets')).data;
      const wanted = store.get(UserPrefs).exportPreset;
      const preset = presets.some((p) => p.id === wanted) ? wanted : exportState.get().preset;
      exportState.set({ presets, preset });
    } catch (err) {
      exportState.set({ planError: `The render presets could not be loaded: ${err.message}` });
      return;
    }
  }
  if (!exportState.get().job && !exportState.get().result) refreshPlan();
}

/**
 * Change an option. The preset and the range change what will be rendered,
 * so the server is asked again; the file's name and the subtitle file do
 * not. The subtitle choice is remembered on this computer.
 * @param {'preset'|'rangeId'|'filename'|'subtitles'} key
 * @param {string} value
 */
export function setExportOption(key, value) {
  if (key === 'subtitles') {
    exportState.set({ subtitles: subtitleChoice(value), error: '' });
    rememberSubtitles(value);
    return;
  }
  exportState.set({ [key]: value, error: '' });
  if (key !== 'filename') refreshPlan();
}
