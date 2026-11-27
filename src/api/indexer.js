/**
 * Media indexing pipeline — scans files and generates sidecar metadata.
 * Phase 1: ffprobe (duration, resolution, codec, fps)
 * Phase 2 (future): Whisper transcripts, visual tags, beat detection
 *
 * Reports progress via SSE stream.
 * @module api/indexer
 */

import { Router } from 'express';
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const indexerRouter = Router();

const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm', '.avi'];
const AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.aac'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const TEXT_EXTS = ['.md', '.txt', '.srt', '.vtt', '.ass'];
const ALL_EXTS = [...VIDEO_EXTS, ...AUDIO_EXTS, ...IMAGE_EXTS, ...TEXT_EXTS];
const SKIP_DIRS = ['.nearedit', 'node_modules', '.git', '.Trash'];

/** Recursively find all media files */
function findMedia(dir, results = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) findMedia(full, results);
    else if (ALL_EXTS.includes(extname(entry.name).toLowerCase())) results.push(full);
  }
  return results;
}

/** Check if sidecar exists and is fresh */
function needsIndex(filePath) {
  const sidecar = `${filePath}.nearedit.json`;
  if (!existsSync(sidecar)) return true;
  try {
    const meta = JSON.parse(readFileSync(sidecar, 'utf-8'));
    const sourceMtime = statSync(filePath).mtimeMs;
    return !meta._sourceMtime || meta._sourceMtime < sourceMtime;
  } catch {
    return true;
  }
}

/** Generate basic metadata via ffprobe */
async function indexFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const type = VIDEO_EXTS.includes(ext)
    ? 'video'
    : AUDIO_EXTS.includes(ext)
      ? 'audio'
      : TEXT_EXTS.includes(ext)
        ? 'text'
        : 'image';
  const stat = statSync(filePath);

  // Text files: parse content directly
  if (type === 'text') {
    return indexTextFile(filePath, ext, stat);
  }

  let probeData = null;
  try {
    const { stdout } = await exec('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);
    probeData = JSON.parse(stdout);
  } catch {}

  const format = probeData?.format || {};
  const videoStream = probeData?.streams?.find((s) => s.codec_type === 'video');
  const audioStream = probeData?.streams?.find((s) => s.codec_type === 'audio');

  const metadata = {
    _sourceMtime: stat.mtimeMs,
    _updatedAt: new Date().toISOString(),
    _indexVersion: 1,
    type,
    filename: filePath.split('/').pop(),
    size: stat.size,
    duration: format.duration ? parseFloat(format.duration) : null,
    bitrate: format.bit_rate ? parseInt(format.bit_rate) : null,
    ...(videoStream && {
      width: videoStream.width,
      height: videoStream.height,
      fps: videoStream.r_frame_rate ? eval(videoStream.r_frame_rate) : null,
      codec: videoStream.codec_name,
      pixFmt: videoStream.pix_fmt,
    }),
    ...(audioStream && {
      audioCodec: audioStream.codec_name,
      sampleRate: audioStream.sample_rate ? parseInt(audioStream.sample_rate) : null,
      channels: audioStream.channels,
    }),
    tags: [],
    transcript: null,
    beats: null,
    keyframes: null,
  };

  writeFileSync(`${filePath}.nearedit.json`, JSON.stringify(metadata, null, 2));
  return metadata;
}

/**
 * Index a text file — scripts, subtitles, notes.
 * @param {string} filePath
 * @param {string} ext
 * @param {import('node:fs').Stats} stat
 */
function indexTextFile(filePath, ext, stat) {
  const content = readFileSync(filePath, 'utf-8');
  const metadata = {
    _sourceMtime: stat.mtimeMs,
    _updatedAt: new Date().toISOString(),
    _indexVersion: 1,
    type: 'text',
    subtype: getTextSubtype(ext),
    filename: filePath.split('/').pop(),
    size: stat.size,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    // Estimated narration duration (avg 150 wpm)
    estimatedDuration: (content.split(/\s+/).filter(Boolean).length / 150) * 60,
    content,
    sections: parseTextSections(content, ext),
    tags: [],
  };

  writeFileSync(`${filePath}.nearedit.json`, JSON.stringify(metadata, null, 2));
  return metadata;
}

/** @param {string} ext */
function getTextSubtype(ext) {
  if (['.srt', '.vtt', '.ass'].includes(ext)) return 'subtitle';
  if (ext === '.md') return 'script';
  return 'notes';
}

/**
 * Parse text into structured sections.
 * SRT/VTT → timed cues. Markdown → heading-based sections.
 * @param {string} content
 * @param {string} ext
 * @returns {object[]}
 */
function parseTextSections(content, ext) {
  if (ext === '.srt') return parseSrt(content);
  if (ext === '.vtt') return parseVtt(content);
  if (ext === '.md') return parseMdSections(content);
  // Plain text: split by double newlines
  return content
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block, i) => ({
      index: i,
      text: block.trim(),
    }));
}

/** Parse SRT into timed cues */
function parseSrt(content) {
  const cues = [];
  const blocks = content.trim().split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/,
    );
    if (!timeMatch) continue;
    const start = +timeMatch[1] * 3600 + +timeMatch[2] * 60 + +timeMatch[3] + +timeMatch[4] / 1000;
    const end = +timeMatch[5] * 3600 + +timeMatch[6] * 60 + +timeMatch[7] + +timeMatch[8] / 1000;
    cues.push({ start, end, text: lines.slice(2).join(' ').trim() });
  }
  return cues;
}

/** Parse VTT into timed cues */
function parseVtt(content) {
  const cues = [];
  const blocks = content
    .replace(/^WEBVTT.*\n/, '')
    .trim()
    .split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const timeMatch = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/,
    );
    if (!timeMatch) continue;
    const start = +timeMatch[1] * 3600 + +timeMatch[2] * 60 + +timeMatch[3] + +timeMatch[4] / 1000;
    const end = +timeMatch[5] * 3600 + +timeMatch[6] * 60 + +timeMatch[7] + +timeMatch[8] / 1000;
    const textLines = lines.slice(lines.indexOf(timeLine) + 1);
    cues.push({ start, end, text: textLines.join(' ').trim() });
  }
  return cues;
}

/** Parse markdown into heading-based sections */
function parseMdSections(content) {
  const sections = [];
  const lines = content.split('\n');
  let current = { heading: '', level: 0, text: '' };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (current.heading || current.text.trim())
        sections.push({ ...current, text: current.text.trim() });
      current = { heading: headingMatch[2], level: headingMatch[1].length, text: '' };
    } else {
      current.text += line + '\n';
    }
  }
  if (current.heading || current.text.trim())
    sections.push({ ...current, text: current.text.trim() });
  return sections;
}

/**
 * POST /api/index?projectId=xxx
 * Scans and indexes all unindexed media. Streams progress via SSE.
 */
indexerRouter.post('/index', async (req, res) => {
  const projectId = req.body.projectId || '';

  // Resolve scan folders
  const folders = [];
  try {
    const regPath = resolve(process.cwd(), 'data/registry.json');
    if (existsSync(regPath)) {
      const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
      const entry = reg[projectId];
      if (entry?.path) {
        folders.push(entry.path);
        const projFile = resolve(entry.path, '.nearedit', 'project.json');
        if (existsSync(projFile)) {
          const proj = JSON.parse(readFileSync(projFile, 'utf-8'));
          if (Array.isArray(proj.mediaFolders)) folders.push(...proj.mediaFolders);
        }
      }
    }
  } catch {}

  if (!folders.length) folders.push(resolve(process.cwd(), 'media'));

  // Find all media
  const allFiles = [];
  for (const dir of folders) findMedia(dir, allFiles);

  // Filter to unindexed
  const toIndex = allFiles.filter(needsIndex);

  // Stream progress
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write(
    `data: ${JSON.stringify({ status: 'started', total: allFiles.length, pending: toIndex.length })}\n\n`,
  );

  let done = 0;
  for (const filePath of toIndex) {
    try {
      await indexFile(filePath);
      done++;
      res.write(
        `data: ${JSON.stringify({ status: 'progress', done, total: toIndex.length, file: filePath.split('/').pop() })}\n\n`,
      );
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ status: 'error', file: filePath.split('/').pop(), error: err.message })}\n\n`,
      );
    }
  }

  res.write(
    `data: ${JSON.stringify({ status: 'complete', indexed: done, total: allFiles.length })}\n\n`,
  );
  res.end();
});

/**
 * GET /api/index/search?q=dog+park&projectId=xxx
 * Search indexed media by tags, transcript, and filename.
 */
indexerRouter.get('/index/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const projectId = req.query.projectId || '';
  if (!query.length) return res.json({ data: [], total: 0 });

  // Resolve folders
  const folders = [];
  try {
    const regPath = resolve(process.cwd(), 'data/registry.json');
    if (existsSync(regPath)) {
      const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
      const entry = reg[projectId];
      if (entry?.path) {
        folders.push(entry.path);
        const projFile = resolve(entry.path, '.nearedit', 'project.json');
        if (existsSync(projFile)) {
          const proj = JSON.parse(readFileSync(projFile, 'utf-8'));
          if (Array.isArray(proj.mediaFolders)) folders.push(...proj.mediaFolders);
        }
      }
    }
  } catch {}
  if (!folders.length) folders.push(resolve(process.cwd(), 'media'));

  const allFiles = [];
  for (const dir of folders) findMedia(dir, allFiles);

  // Search sidecars
  const results = [];
  for (const filePath of allFiles) {
    const sidecarPath = `${filePath}.nearedit.json`;
    if (!existsSync(sidecarPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(sidecarPath, 'utf-8'));
      const searchable = [
        meta.filename || '',
        ...(meta.tags || []),
        meta.transcript ? JSON.stringify(meta.transcript) : '',
      ]
        .join(' ')
        .toLowerCase();

      if (query.every((q) => searchable.includes(q))) {
        results.push({ filePath, ...meta });
      }
    } catch {}
  }

  res.json({ data: results, total: results.length });
});
