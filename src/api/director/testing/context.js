/**
 * Test helper: an ActionContext for a fixture project, with the log and
 * progress calls collected for assertions.
 * @module api/director/testing/context
 */

import { normalizeDirective } from '#utils/director/directive.js';
import { gatherMedia } from '../context/gather.js';
import { createLlmClient } from '../llm/client.js';

/**
 * @param {import('./fixtures.js').TestProject} project
 * @param {object} directive - Raw directive, normalised like the route does
 * @param {{ edl?: any, llmUrl?: string, provider?: string, signal?: AbortSignal,
 *   format?: Partial<import('../pipeline.js').ActionContext['format']> }} [extra]
 * @returns {Promise<import('../pipeline.js').ActionContext & { logs: string[] }>}
 */
export async function makeContext(project, directive, extra = {}) {
  const normal = normalizeDirective(directive);
  if (normal.ok === false) throw new Error(`bad test directive: ${JSON.stringify(normal)}`);
  const logs = [];
  return {
    projectId: project.projectId,
    projectDir: project.dir,
    directive: normal.directive,
    edl: extra.edl || null,
    format: {
      fps: 30,
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
      name: 'Main Edit',
      ...extra.format,
    },
    media: await gatherMedia(project.projectId),
    llm: createLlmClient({
      provider: extra.provider || (extra.llmUrl ? 'ollama' : 'none'),
      url: extra.llmUrl || 'http://127.0.0.1:9',
      model: 'test-model',
      apiKey: '',
    }),
    signal: extra.signal,
    progress: (_percent, message) => message && logs.push(message),
    log: (message) => logs.push(message),
    logs,
  };
}
