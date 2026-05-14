/**
 * Media library route — recursively scans the project folder for media.
 * The project folder IS the media folder. Skips .nearedit/ and hidden dirs.
 * @module api/media
 */

import { Router } from 'express';
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { resolve, extname, relative, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const mediaRouter = Router();

const DEV_MEDIA_DIR = resolve(process.cwd(), 'media');
const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm', '.avi'];
const AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.aac'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const TEXT_EXTS = ['.md', '.txt', '.srt', '.vtt', '.ass'];
const ALL_EXTS = [...VIDEO_EXTS, ...AUDIO_EXTS, ...IMAGE_EXTS, ...TEXT_EXTS];
const SKIP_DIRS = ['.nearedit', 'node_modules', '.git', '.Trash'];

/**
 * Resolve the project folder path from registry.
 * @param {string} [projectId]
 * @returns {string}
 */
function getProjectDir(projectId) {
  if (!projectId) return DEV_MEDIA_DIR;
  try {
    const regPath = resolve(process.cwd(), 'data/registry.json');
    if (!existsSync(regPath)) return DEV_MEDIA_DIR;
    const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
    return reg[projectId]?.path || DEV_MEDIA_DIR;
  } catch { return DEV_MEDIA_DIR; }
}

/**
 * Recursively scan a directory for media files.
 * @param {string} dir
 * @param {string} rootDir - For computing relative paths
 * @param {object[]} results
 */
function scanRecursive(dir, rootDir, results) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.includes(entry.name)) continue;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      scanRecursive(fullPath, rootDir, results);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (ALL_EXTS.includes(ext)) {
        results.push({
          filename: entry.name,
          filePath: fullPath,
          relativePath: relative(rootDir, fullPath),
        });
      }
    }
  }
}

/**
 * Probe a media file with ffprobe.
 * @param {string} filePath
 * @returns {Promise<object|null>}
 */
async function probe(filePath) {
  try {
    const { stdout } = await exec('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath,
    ]);
    return JSON.parse(stdout);
  } catch { return null; }
}

/** GET /api/media?projectId=xxx — recursively scan project folder + additional media folders */
mediaRouter.get('/media', async (req, res) => {
  const projectId = req.query.projectId || '';
  const projectDir = getProjectDir(projectId);

  // Collect all scan roots: project dir + any additional media folders
  const scanRoots = [projectDir];
  try {
    const regPath = resolve(process.cwd(), 'data/registry.json');
    if (existsSync(regPath)) {
      const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
      const entry = reg[projectId];
      if (entry?.path) {
        const projFile = resolve(entry.path, '.nearedit', 'project.json');
        if (existsSync(projFile)) {
          const proj = JSON.parse(readFileSync(projFile, 'utf-8'));
          if (Array.isArray(proj.mediaFolders)) {
            for (const f of proj.mediaFolders) {
              if (f && !scanRoots.includes(f)) scanRoots.push(f);
            }
          }
        }
      }
    }
  } catch {}

  const entries = [];
  for (const root of scanRoots) {
    scanRecursive(root, root, entries);
  }

  const items = await Promise.all(entries.map(async (entry) => {
    const stat = statSync(entry.filePath);
    const ext = extname(entry.filename).toLowerCase();
    const type = VIDEO_EXTS.includes(ext) ? 'video' : AUDIO_EXTS.includes(ext) ? 'audio' : TEXT_EXTS.includes(ext) ? 'text' : 'image';
    const probeData = await probe(entry.filePath);
    const duration = probeData?.format?.duration ? parseFloat(probeData.format.duration) : null;

    // Check for existing sidecar metadata
    const sidecarFile = `${entry.filePath}.nearedit.json`;
    let sidecar = null;
    if (existsSync(sidecarFile)) {
      try { sidecar = JSON.parse(readFileSync(sidecarFile, 'utf-8')); } catch {}
    }

    return {
      filename: entry.filename,
      filePath: entry.filePath,
      relativePath: entry.relativePath,
      type,
      size: stat.size,
      duration,
      indexed: !!sidecar,
      tags: sidecar?.tags || [],
      transcript: sidecar?.transcript ? true : false,
    };
  }));

  res.json({ data: items, total: items.length });
});

/** GET /api/media/file?path=/absolute/path — serve any media file */
mediaRouter.get('/media/file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});
