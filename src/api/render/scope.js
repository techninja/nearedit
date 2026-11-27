/**
 * What a render covers: which clips produce picture or sound, which files
 * they read, and whether there is anything to render at all. Pure.
 * @module api/render/scope
 */

import { clipKind } from '#utils/edl/factory.js';
import { activeTracks } from '#utils/edl/query.js';
import { RenderError } from './errors.js';
import { getPreset } from './presets.js';
import { createTiming } from './timing.js';

/**
 * Clips that produce picture or sound: on a track that is not muted (or is
 * solo), and not a placeholder.
 * @param {{ tracks?: any[] }} edl
 * @returns {{ clip: any, track: any, kind: string }[]}
 */
export function renderableClips(edl) {
  const tracks = edl?.tracks || [];
  const active = [...activeTracks(tracks, 'video'), ...activeTracks(tracks, 'audio')];
  return active.flatMap((track) =>
    (track.clips || [])
      .map((clip) => ({ clip, track, kind: clipKind(clip, track) }))
      .filter(({ clip, kind }) => kind !== 'placeholder' && clip.timelineEnd > clip.timelineStart)
      .filter(({ kind }) => track.type !== 'audio' || kind !== 'title'),
  );
}

/**
 * Source files a render reads.
 * @param {{ tracks?: any[] }} edl
 * @returns {string[]} Unique paths
 */
export function renderSources(edl) {
  const files = renderableClips(edl).map(({ clip }) => clip.sourceFile);
  return [...new Set(files.filter(Boolean))];
}

/**
 * Resolve the preset and the rendered span, refusing what cannot be rendered.
 * @param {{ fps?: number, tracks?: any[] }} edl
 * @param {{ preset?: string, range?: { start?: number, end?: number } | null }} [options]
 * @returns {{ preset: import('./presets.js').RenderPreset, timing: import('./timing.js').Timing }}
 * @throws {RenderError} 422 for an unknown preset, an empty timeline or an empty range
 */
export function checkRenderable(edl, options = {}) {
  const preset = getPreset(options.preset);
  if (!preset) throw new RenderError(422, `Unknown preset "${options.preset}"`);
  const timing = createTiming(edl, options.range);
  if (!timing.totalFrames || !renderableClips(edl).length)
    throw new RenderError(422, 'Timeline is empty: there is nothing to render');
  if (!timing.frames) throw new RenderError(422, 'Range is outside the timeline');
  return { preset, timing };
}
