/**
 * Everything a render plan needs that takes I/O: rendering the music the
 * timeline plays and does not have yet, probing the sources and detecting
 * what FFmpeg can do.
 * @module api/render/prepare
 */

import { HttpError } from '../lib/httpErrors.js';
import { renderMusicOf } from '../music/timeline.js';
import { getCapabilities } from './capabilities.js';
import { RenderError } from './errors.js';
import { probeSources } from './probe.js';
import { renderableClips, renderSources } from './scope.js';

/**
 * @param {{ tracks?: any[] }} edl - A checked EDL
 * @param {{ signal?: AbortSignal, log?: (message: string) => void }} [opts]
 * @returns {Promise<{ probes: Record<string, any>,
 *   capabilities: import('./capabilities.js').Capabilities }>}
 * @throws {RenderError} 422 for an unreadable source or a song too heavy to
 *   render, 503 when FFmpeg is missing or cannot encode H.264
 */
export async function prepareRender(edl, opts = {}) {
  // Music is made, not asked for: a missing rendering exists before anything is probed.
  const clips = renderableClips(edl).map(({ clip }) => clip);
  await renderMusicOf(clips, opts).catch((err) => {
    throw err instanceof HttpError ? new RenderError(err.status, err.message) : err;
  });
  const [probes, capabilities] = await Promise.all([
    probeSources(renderSources(edl), opts),
    getCapabilities(),
  ]);
  if (!capabilities.libx264) throw new RenderError(503, 'This FFmpeg build has no libx264 encoder');
  return { probes, capabilities };
}
