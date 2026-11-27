/**
 * Fixtures for the command-line tests: a hand-written project in a temporary
 * folder, and the tool run as a user runs it — a process of its own, started
 * from a folder that is neither the repository nor the project.
 * @module bin/lib/testkit
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BIN = fileURLToPath(new URL('../nearedit.js', import.meta.url));

/**
 * Generate a short clip of one colour.
 * @param {string} path
 * @param {string} color
 */
function footage(path, color) {
  const source = ['-f', 'lavfi', '-i', `color=${color}:s=320x180:r=30:d=4`];
  const quiet = ['-hide_banner', '-loglevel', 'error', '-y'];
  const done = spawnSync('ffmpeg', [...quiet, ...source, '-pix_fmt', 'yuv420p', path]);
  assert.equal(done.status, 0, String(done.stderr));
}

/**
 * ffprobe a file.
 * @param {string} path
 * @returns {any[]} Its streams, frames counted
 */
export function probe(path) {
  const args = ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', path];
  return JSON.parse(spawnSync('ffprobe', args, { encoding: 'utf8' }).stdout).streams;
}

/** @param {number} start @param {number} end @param {string} [content] @returns {object} */
export const title = (start, end, content = 'Hello') => ({
  ...{ timelineStart: start, timelineEnd: end },
  text: { content, fontSize: 48 },
});

/** @param {number} start @param {number} end @param {string} [sourceFile] @returns {object} */
export const film = (start, end, sourceFile = 'media/film.mp4') => ({
  ...{ sourceFile, timelineStart: start, timelineEnd: end },
});

/**
 * Footage for 3 s with a title over its middle second — hand-written, every
 * default left out.
 * @param {object} [clip] - The footage clip
 * @returns {any}
 */
export const edit = (clip = film(0, 3)) => ({
  fps: 30,
  resolution: '320x180',
  tracks: [
    { type: 'video', clips: [title(1, 2)] },
    { type: 'video', clips: [clip] },
  ],
});

/**
 * Create the fixture: `project/media/film.mp4` (red), `library/sea.mp4`
 * (blue, outside the project), and an empty folder to run from.
 * @returns {{ root: string, project: string, library: string,
 *   cli: (...args: string[]) => { code: number, out: string, err: string },
 *   save: (name: string, document: object|string) => string, remove: () => void }}
 */
export function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'nearedit-cli-'));
  const [project, library, elsewhere] = ['project', 'library', 'elsewhere'].map((name) =>
    join(root, name),
  );
  for (const dir of [join(project, 'media'), library, elsewhere])
    mkdirSync(dir, { recursive: true });
  footage(join(project, 'media', 'film.mp4'), 'red');
  footage(join(library, 'sea.mp4'), 'blue');
  return {
    ...{ root, project, library, elsewhere },
    cli(...args) {
      const done = spawnSync(process.execPath, [BIN, ...args], {
        cwd: elsewhere,
        encoding: 'utf8',
      });
      return { code: done.status, out: done.stdout, err: done.stderr };
    },
    save(name, document) {
      const path = join(project, name);
      writeFileSync(path, typeof document === 'string' ? document : JSON.stringify(document));
      return path;
    },
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}
