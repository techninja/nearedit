/**
 * Probe step — the basic facts every other step and the media bin rely on:
 * ffprobe fields for video/audio/images, parsed content for text files.
 * @module api/intelligence/steps/probe
 */

import { statSync } from 'node:fs';
import { basename } from 'node:path';
import { probeText } from './probeText.js';

/** @typedef {import('./types.js').Step} Step */

/**
 * True when a sidecar already carries probe results (a sidecar created by a
 * user tag edit, or by the legacy indexer, does not count).
 * @param {import('./types.js').Sidecar|null} sidecar
 * @returns {boolean}
 */
export function isProbed(sidecar) {
  if (!sidecar || typeof sidecar.size !== 'number') return false;
  if (sidecar.type === 'text') return typeof sidecar.wordCount === 'number';
  return typeof sidecar.hasVideo === 'boolean' && typeof sidecar.hasAudio === 'boolean';
}

/** @type {Step} */
export const probeStep = {
  name: 'probe',
  jobType: 'index',
  unsuitable: () => '',
  done: (sidecar) => isProbed(sidecar),

  async run(filePath, ctx) {
    const base = { type: ctx.type, filename: basename(filePath), size: statSync(filePath).size };
    if (ctx.type === 'text') return { ...base, ...probeText(filePath) };

    const info = await ctx.deps.probe(filePath, { signal: ctx.signal });
    if (!info) throw new Error('ffprobe could not read this file');
    const still = ctx.type === 'image';
    /** @type {Record<string, any>} */
    const patch = {
      ...base,
      duration: still ? null : info.duration,
      bitrate: info.bitrate,
      hasVideo: info.hasVideo && !still,
      hasAudio: info.hasAudio && !still,
    };
    if (info.hasVideo) {
      const sideways = Math.abs(info.rotation || 0) % 180 === 90;
      Object.assign(patch, {
        width: info.width,
        height: info.height,
        // What a player shows once the rotation flag is applied
        displayWidth: sideways ? info.height : info.width,
        displayHeight: sideways ? info.width : info.height,
        resolution: `${info.width}x${info.height}`,
        fps: still ? null : info.fps,
        codec: info.codec,
        pixFmt: info.pixFmt,
        rotation: info.rotation || 0,
      });
    }
    if (info.hasAudio && !still) {
      Object.assign(patch, {
        audioCodec: info.audioCodec,
        sampleRate: info.sampleRate,
        channels: info.channels,
      });
    }
    return patch;
  },

  summary: (patch) => ({ type: patch.type, duration: patch.duration ?? null }),
};
