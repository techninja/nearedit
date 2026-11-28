/**
 * Test helpers for the site demo: a scratch project folder, an
 * ActionContext that needs no project, and a recording of a recipe made by
 * the stand-in recorder. Not part of the runtime — import it from tests.
 * @module api/director/web/testing/kit
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeDirective } from '#utils/director/directive.js';
import { normalizeRecipe } from '#utils/web/index.js';
import { createLlmClient } from '../../llm/client.js';
import { fakeRecorder } from './fakeRecorder.js';

/** The address the page fixture stands for. */
export const SITE = 'https://tideline.test/';

/** The frame shapes every demo has to work in. */
export const FORMATS = [
  { name: '16:9', fps: 30, width: 1920, height: 1080 },
  { name: '9:16', fps: 30, width: 1080, height: 1920 },
  { name: '1:1', fps: 30, width: 1080, height: 1080 },
];

/**
 * A folder that stands for a project; removed when the process ends.
 * @returns {string}
 */
export function scratchProject() {
  const dir = mkdtempSync(join(tmpdir(), 'nearedit-sitedemo-'));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * An ActionContext for `site_demo`, with what it logs collected.
 * @param {string} projectDir
 * @param {object} directive - Raw; the action and the test address are filled in
 * @param {{ edl?: any, format?: object, llmUrl?: string, signal?: AbortSignal }} [extra] -
 *   `llmUrl`: a fake LLM server; without one no provider is configured
 * @returns {import('../../pipeline.js').ActionContext & { logs: string[], seen: number[] }}
 */
export function demoContext(projectDir, directive, extra = {}) {
  const raw = { action: 'site_demo', ...directive };
  const normal = normalizeDirective({ ...raw, params: { url: SITE, ...raw.params } });
  if (normal.ok === false) throw new Error(`bad test directive: ${JSON.stringify(normal)}`);
  /** @type {string[]} */
  const logs = [];
  /** @type {number[]} */
  const seen = [];
  return {
    projectId: 'proj-demo',
    projectDir,
    directive: normal.directive,
    edl: extra.edl || null,
    format: { ...FORMATS[0], aspectRatio: '16:9', name: 'Main Edit', ...extra.format },
    media: [],
    llm: createLlmClient({
      provider: extra.llmUrl ? 'ollama' : 'none',
      url: extra.llmUrl || 'http://127.0.0.1:9',
      model: 'test-model',
      apiKey: '',
    }),
    signal: extra.signal || new AbortController().signal,
    progress: (percent, message) => {
      seen.push(percent);
      if (message) logs.push(message);
    },
    log: (message) => logs.push(message),
    logs,
    seen,
  };
}

/**
 * The recording the stand-in recorder makes of a recipe.
 * @param {string} folder
 * @param {object} recipe - Raw; the test address is filled in
 * @param {number} [fps]
 * @returns {Promise<{ recording: import('../../../web/cache.js').Recording,
 *   recipe: import('#utils/web/types.js').Recipe }>}
 */
export async function recordingOf(folder, recipe, fps = 30) {
  const normal = normalizeRecipe({ url: SITE, onMissing: 'skip', ...recipe });
  const recording = await fakeRecorder().record({ folder, recipe: normal, fps });
  return { recording, recipe: normal };
}

/** The page each frame shape records, CSS pixels. */
export const VIEWS = { '16:9': [1280, 720], '9:16': [390, 844], '1:1': [960, 960] };

/** A demo of six stops; the fourth takes two steps (a scroll to the middle, then the click). */
export const DEMO_STEPS = [
  { do: 'hover', target: 'text=Get started', note: 'Start here' },
  { do: 'scroll', to: '#features', align: 'start' },
  { do: 'focus', target: 'svg[aria-label="Readers chart"]', note: 'Readers, week by week' },
  {
    do: 'scroll',
    to: 'text=Yearly',
    align: 'center',
    duration: 0.7,
    hold: 0.1,
    note: 'Two months free',
  },
  { do: 'click', target: 'text=Yearly', note: 'Two months free' },
  { do: 'type', target: 'label=Email', text: 'hello@example.com' },
  { do: 'click', target: 'text=Create account', note: 'And you are in' },
];
/** Per step, the stop it belongs to; and what each stop is called. */
export const DEMO_OWNERS = [0, 1, 2, 3, 3, 4, 5];
export const DEMO_LABELS = [
  'Start here',
  'scroll “Features”',
  'Readers',
  'Two months free',
  'type',
  'In',
];

/**
 * The demo recorded for every frame shape.
 * @param {string} folder
 * @returns {Promise<Record<string, Awaited<ReturnType<typeof recordingOf>>>>} By format name
 */
export async function demoRecordings(folder) {
  /** @type {Record<string, any>} */
  const made = {};
  for (const format of FORMATS) {
    const [width, height] = VIEWS[format.name];
    made[format.name] = await recordingOf(folder, {
      viewport: { width, height },
      steps: DEMO_STEPS,
    });
  }
  return made;
}
