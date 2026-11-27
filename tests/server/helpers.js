/**
 * Shared fixtures for the server tests: an isolated sandbox on disk, small
 * generated media and a bare Express app for the routers under test.
 * The HTTP client helpers live in ./http.js. Not a test file itself.
 * @module tests/server/helpers
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { apiNotFound, errorHandler } from '../../src/api/lib/httpErrors.js';

/**
 * Create a private directory tree and point the server's configuration at
 * it. `home` is the only browse root; `outside` is a real folder that no
 * route may ever touch.
 * @param {string} name - Used in the temp directory name
 * @returns {{ root: string, data: string, home: string, project: string, devMedia: string,
 *   outside: string, cleanup: () => void }}
 */
export function createSandbox(name) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `nearedit-${name}-`)));
  const dirs = {
    root,
    data: join(root, 'data'),
    home: join(root, 'home'),
    project: join(root, 'home', 'project'),
    devMedia: join(root, 'devmedia'),
    outside: join(root, 'outside'),
  };
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dirs.outside, 'secret.txt'), 'do not serve');
  Object.assign(process.env, {
    NEAREDIT_DATA_DIR: dirs.data,
    NEAREDIT_MEDIA_DIR: dirs.devMedia,
    BROWSE_ROOTS: dirs.home,
    GLOBAL_MEDIA_PATHS: '',
  });
  return { ...dirs, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * @param {string[]} args - ffmpeg arguments after the global flags
 */
function ffmpeg(args) {
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...args]);
}

/**
 * Generate a small video (2.5 s, 320x180, 30 fps, with a tone), an MP3
 * (2 s), a PNG (200x120) and a text file into a folder.
 * @param {string} dir
 * @returns {{ video: string, audio: string, image: string, text: string }}
 */
export function makeMedia(dir) {
  const files = {
    video: join(dir, 'clip.mp4'),
    audio: join(dir, 'tone.mp3'),
    image: join(dir, 'still.png'),
    text: join(dir, 'notes.md'),
  };
  const picture = ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=2.5'];
  const tone = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2.5'];
  const h264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
  ffmpeg([...picture, ...tone, ...h264, '-c:a', 'aac', '-shortest', files.video]);
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=660:duration=2', '-c:a', 'libmp3lame', files.audio]);
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=200x120', '-frames:v', '1', files.image]);
  writeFileSync(files.text, '# Notes\n\nShot list for the park edit.\n');
  return files;
}

/**
 * Mount routers on a bare Express app listening on an ephemeral port.
 * @param {...import('express').Router} routers
 * @returns {Promise<{ url: string, server: import('node:http').Server, close: () => Promise<void> }>}
 */
export async function serve(...routers) {
  const app = express();
  app.use(express.json());
  for (const router of routers) app.use('/api', router);
  app.use('/api', apiNotFound);
  app.use(errorHandler);
  /** @type {import('node:http').Server} */
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const close = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  return { url: `http://127.0.0.1:${port}`, server, close };
}

export { call, jpegSize, q, rawGet } from './http.js';
