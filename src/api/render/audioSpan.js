/**
 * The audible clips of the sound graph as spans of output samples. Only
 * audio tracks make sound; a clip without an audio stream, or one whose
 * gain is nothing, is left out. Pure.
 * @module api/render/audioSpan
 */

import { clipGain } from '#utils/edl/levels.js';
import { activeTracks } from '#utils/edl/query.js';
import { hasVolumeKeys } from './audioEnvelope.js';
import { clipWindow, sampleAt } from './timing.js';

/**
 * Every audible clip as a span of output samples.
 * @param {any[]} tracks - Snapped tracks
 * @param {import('./videoGraph.js').GraphContext} ctx
 * @returns {any[]} Sorted by start
 */
export function audibleSpans(tracks, ctx) {
  const { timing } = ctx;
  const at = (frame) => sampleAt(frame, timing.fps);
  const spans = [];
  for (const track of activeTracks(tracks, 'audio')) {
    for (const clip of track.clips) {
      const window = clip.sourceFile ? clipWindow(clip, timing) : null;
      if (!window) continue;
      const source = ctx.source(clip.sourceFile);
      const enveloped = hasVolumeKeys(clip);
      // Static part of the shared gain rule; the fades become afade filters.
      const gain = clipGain(track, { ...clip, fadeIn: 0, fadeOut: 0 }, clip.timelineStart);
      if (!source.hasAudio || !((enveloped ? (track.volume ?? 1) : gain) > 0)) continue;
      spans.push({
        ...{ clip, track, gain, enveloped, seek: window.seek, mono: source.channels === 1 },
        ...{ from: window.first / timing.fps, to: window.last / timing.fps },
        start: at(window.first) - at(timing.startFrame),
        length: at(window.last) - at(window.first),
        offset: at(window.first) - at(clip.startFrame),
        clipLength: at(clip.endFrame) - at(clip.startFrame),
      });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}
