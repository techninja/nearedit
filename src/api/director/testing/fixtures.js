/**
 * Test fixtures: a temporary registered project holding small
 * lavfi-generated media, with hand-built sidecars written through
 * lib/sidecar.js. Sets NEAREDIT_DATA_DIR to a private temp directory.
 * @module api/director/testing/fixtures
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { run } from '../../lib/ffmpeg.js';
import { projectFilePath, saveRegistry, writeJsonAtomic } from '../../lib/registry.js';
import { writeSidecar } from '../../lib/sidecar.js';

/**
 * @typedef {Object} MediaSpec
 * @property {'video'|'audio'|'image'} [type] - Default: from the extension
 * @property {number} [duration] - Seconds (video/audio), default 6
 * @property {string} [size] - "WxH" of video/image, default 320x180
 * @property {boolean} [audio] - Whether a video has a sound stream, default true
 * @property {object|false} [sidecar] - Sidecar fields; `false` leaves the file un-analysed.
 *   Probe fields (duration, width, height, hasAudio) are filled in automatically.
 * @typedef {Object} TestProject
 * @property {string} projectId
 * @property {string} adaptationId
 * @property {string} dir - Project directory
 * @property {Record<string, string>} paths - Absolute path by relative name
 * @property {() => void} cleanup
 */

const lavfi = (/** @type {string} */ graph) => ['-f', 'lavfi', '-i', graph];

/**
 * Generate one media file with ffmpeg.
 * @param {string} path
 * @param {MediaSpec} spec
 * @returns {Promise<object>} The probe fields a sidecar would carry
 */
export async function makeMedia(path, spec = {}) {
  const ext = path.split('.').pop().toLowerCase();
  const type =
    spec.type || (['png', 'jpg'].includes(ext) ? 'image' : ext === 'wav' ? 'audio' : 'video');
  const duration = spec.duration ?? 6;
  const size = spec.size || '320x180';
  const [width, height] = size.split('x').map(Number);
  mkdirSync(dirname(path), { recursive: true });
  const quiet = ['-v', 'error', '-y'];
  if (type === 'image') {
    await run('ffmpeg', [...quiet, ...lavfi(`testsrc2=size=${size}`), '-frames:v', '1', path]);
    return { type, width, height, hasAudio: false, hasVideo: true };
  }
  if (type === 'audio') {
    await run('ffmpeg', [...quiet, ...lavfi(`sine=frequency=220:duration=${duration}`), path]);
    return { type, duration, hasAudio: true, hasVideo: false };
  }
  const withAudio = spec.audio !== false;
  await run('ffmpeg', [
    ...quiet,
    ...lavfi(`testsrc2=size=${size}:rate=30:duration=${duration}`),
    ...(withAudio ? lavfi(`sine=frequency=440:duration=${duration}`) : []),
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'],
    ...(withAudio ? ['-c:a', 'aac', '-shortest'] : []),
    path,
  ]);
  return { type, duration, width, height, fps: 30, hasAudio: withAudio, hasVideo: true };
}

/**
 * Create and register a temporary project.
 * @param {Record<string, MediaSpec>} media - Spec by path relative to the project
 * @param {{ resolution?: string, fps?: number, aspectRatio?: string }} [format]
 * @returns {Promise<TestProject>}
 */
export async function createProject(media, format = {}) {
  const root = mkdtempSync(join(tmpdir(), 'nearedit-director-'));
  process.env.NEAREDIT_DATA_DIR = join(root, 'data');
  process.env.GLOBAL_MEDIA_PATHS = '';
  const dir = join(root, 'project');
  const projectId = 'proj-test';
  const adaptationId = 'adapt-main';
  /** @type {Record<string, string>} */
  const paths = {};
  for (const [name, spec] of Object.entries(media)) {
    paths[name] = join(dir, name);
    const probed = await makeMedia(paths[name], spec);
    if (spec.sidecar !== false) writeSidecar(paths[name], { ...probed, ...(spec.sidecar || {}) });
  }
  mkdirSync(dir, { recursive: true });
  writeJsonAtomic(projectFilePath(dir), {
    id: projectId,
    name: 'Director test',
    mediaFolders: [],
    adaptations: [
      {
        id: adaptationId,
        projectId,
        name: 'Main Edit',
        aspectRatio: format.aspectRatio || '16:9',
        resolution: format.resolution || '1920x1080',
        fps: format.fps || 30,
        status: 'draft',
      },
    ],
  });
  saveRegistry({ [projectId]: { path: dir, name: 'Director test' } });
  return {
    projectId,
    adaptationId,
    dir,
    paths,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export { beatGrid, say } from './words.js';
