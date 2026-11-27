/**
 * Everything a render plan needs that takes I/O: probing the sources and
 * detecting what FFmpeg can do.
 * @module api/render/prepare
 */

import { getCapabilities } from './capabilities.js';
import { RenderError } from './errors.js';
import { probeSources } from './probe.js';
import { renderSources } from './scope.js';

/**
 * @param {{ tracks?: any[] }} edl - A checked EDL
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ probes: Record<string, any>,
 *   capabilities: import('./capabilities.js').Capabilities }>}
 * @throws {RenderError} 422 for an unreadable source, 503 when FFmpeg is
 *   missing or cannot encode H.264
 */
export async function prepareRender(edl, opts = {}) {
  const [probes, capabilities] = await Promise.all([
    probeSources(renderSources(edl), opts),
    getCapabilities(),
  ]);
  if (!capabilities.libx264) throw new RenderError(503, 'This FFmpeg build has no libx264 encoder');
  return { probes, capabilities };
}
