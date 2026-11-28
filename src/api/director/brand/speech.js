/**
 * Who speaks where on a timeline, for the brand pass: the files that are
 * heard speaking, in the order they first speak, each with that moment.
 * A lower third goes where a speaker first speaks — at the first word the
 * clip plays, when the file has a transcript.
 * @module api/director/brand/speech
 */

import { clipSpeech } from '#utils/director/score/speech.js';
import { isMusicClip } from '#utils/music/clip.js';
import { typedTracks } from '../result.js';

/**
 * @typedef {import('../context/mediaInfo.js').MediaInfo} MediaInfo
 * @typedef {Object} Speaking - One file that speaks on the timeline
 * @property {MediaInfo} media
 * @property {number} time - Timeline seconds: where it first speaks
 * @property {number} until - Where the clip it first speaks in ends
 * @property {{ clip: any, time: number, until: number }[]} clips - Every clip of it that speaks
 */

/**
 * @param {any} edl - The posted document
 * @param {(filePath: string) => MediaInfo|null} lookup
 * @returns {Speaking[]} In the order they first speak
 */
export function speakingFiles(edl, lookup) {
  const audio = typedTracks(edl).filter(({ type }) => type === 'audio');
  const soloed = audio.some(({ track }) => track.solo);
  /** @type {Map<string, Speaking>} */
  const files = new Map();
  for (const { track } of audio) {
    if (track.muted || (soloed && !track.solo) || !(track.volume ?? 1)) continue;
    for (const clip of track.clips || []) {
      if (!clip.sourceFile || isMusicClip(clip) || clip.intent === 'music') continue;
      const media = lookup(clip.sourceFile);
      const marked = ['narration', 'primary'].includes(clip.intent);
      if (!media || (media.kind === 'music' && !marked)) continue;
      const found = clipSpeech(clip, media, marked || media.kind === 'speech');
      if (!found.spans.length) continue;
      const said = { clip, time: found.spans[0].start, until: clip.timelineEnd };
      const known = files.get(media.filePath);
      if (!known) files.set(media.filePath, { media, ...said, clips: [said] });
      else {
        known.clips.push(said);
        if (said.time < known.time) Object.assign(known, { time: said.time, until: said.until });
      }
    }
  }
  return [...files.values()].sort((a, b) => a.time - b.time);
}

/**
 * Where a file speaks a segment of its transcript on the timeline.
 * @param {Speaking} file
 * @param {number} segment - Its number in the transcript, from 1
 * @returns {{ time: number, until: number }|null} null when no clip plays that segment
 */
export function segmentTime(file, segment) {
  const said = file.media.segments[segment - 1];
  if (!said) return null;
  for (const { clip, until } of file.clips) {
    if (said.end <= clip.sourceIn || said.start >= clip.sourceOut) continue;
    const time = clip.timelineStart + Math.max(clip.sourceIn, said.start) - clip.sourceIn;
    return { time, until };
  }
  return null;
}
