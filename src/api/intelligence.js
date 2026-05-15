/**
 * Intelligence pipeline — dispatches AI jobs to hydra (GPU server).
 * Hydra pulls media files from our server via HTTP, processes them, returns JSON.
 * Results written to sidecar files next to source media.
 * @module api/intelligence
 */

import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';

const exec = promisify(execFile);
export const intelligenceRouter = Router();

const HYDRA_HOST = process.env.HYDRA_HOST || 'hydra';
const WHISPER_CMD = '~/nearedit-env/bin/python3 ~/nearedit-workers/transcribe.py';
const TAGGER_CMD = '~/nearedit-env/bin/python3 ~/nearedit-workers/tag_keyframes.py';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'medium';
const VISION_MODEL = process.env.VISION_MODEL || 'llava:7b';

/** Our server URL as seen from hydra */
function serverUrl() {
  const host = process.env.SERVER_HOST || '192.168.86.26';
  const port = process.env.PORT || 6556;
  return `http://${host}:${port}`;
}

/** Build a URL that hydra can use to fetch a file from us */
function fileUrl(filePath) {
  return `${serverUrl()}/api/media/file?path=${encodeURIComponent(filePath)}`;
}

/**
 * Run a command on hydra via SSH.
 * @param {string} cmd
 * @param {number} [timeout=300000]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
async function sshExec(cmd, timeout = 300_000) {
  return exec('ssh', [HYDRA_HOST, cmd], { timeout, maxBuffer: 50 * 1024 * 1024 });
}

/**
 * Read existing sidecar or create empty one.
 * @param {string} filePath
 * @returns {object}
 */
function loadSidecar(filePath) {
  const sidecarPath = `${filePath}.nearedit.json`;
  if (existsSync(sidecarPath)) {
    try { return JSON.parse(readFileSync(sidecarPath, 'utf-8')); } catch {}
  }
  return { _sourceMtime: statSync(filePath).mtimeMs, _updatedAt: new Date().toISOString() };
}

/**
 * Write sidecar metadata.
 * @param {string} filePath
 * @param {object} data
 */
function saveSidecar(filePath, data) {
  data._sourceMtime = statSync(filePath).mtimeMs;
  data._updatedAt = new Date().toISOString();
  writeFileSync(`${filePath}.nearedit.json`, JSON.stringify(data, null, 2));
}

/**
 * POST /api/intelligence/transcribe
 * Body: { filePath: "/abs/path/to/file.mp4" }
 */
intelligenceRouter.post('/intelligence/transcribe', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath || !existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify({ status: 'started', file: filePath })}\n\n`);

  try {
    const url = fileUrl(filePath);
    const cmd = `${WHISPER_CMD} '${url}' --model ${WHISPER_MODEL}`;

    res.write(`data: ${JSON.stringify({ status: 'processing', message: 'Running Whisper...' })}\n\n`);
    const { stdout } = await sshExec(cmd, 600_000);

    const transcript = JSON.parse(stdout);

    const sidecar = loadSidecar(filePath);
    sidecar.transcript = transcript.words;
    sidecar.segments = transcript.segments;
    sidecar.language = transcript.language;
    sidecar.transcriptDuration = transcript.duration;
    saveSidecar(filePath, sidecar);

    res.write(`data: ${JSON.stringify({ status: 'complete', wordCount: transcript.words.length, language: transcript.language })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ status: 'error', error: err.message })}\n\n`);
  }
  res.end();
});

/**
 * POST /api/intelligence/tag
 * Body: { filePath: "/abs/path/to/file.mp4", frames: 5 }
 */
intelligenceRouter.post('/intelligence/tag', async (req, res) => {
  const { filePath, frames = 5 } = req.body;
  if (!filePath || !existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`data: ${JSON.stringify({ status: 'started', file: filePath })}\n\n`);

  try {
    const url = fileUrl(filePath);
    const cmd = `${TAGGER_CMD} '${url}' --frames ${frames} --model ${VISION_MODEL}`;

    res.write(`data: ${JSON.stringify({ status: 'processing', message: 'Extracting keyframes and tagging...' })}\n\n`);
    const { stdout } = await sshExec(cmd, 300_000);

    const result = JSON.parse(stdout);

    const sidecar = loadSidecar(filePath);
    sidecar.tags = result.tags || [];
    sidecar.keyframes = result.keyframes || [];
    saveSidecar(filePath, sidecar);

    res.write(`data: ${JSON.stringify({ status: 'complete', tags: result.tags, keyframeCount: result.keyframes.length })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ status: 'error', error: err.message })}\n\n`);
  }
  res.end();
});

/**
 * POST /api/intelligence/analyze
 * Body: { projectId: "xxx" }
 * Full pipeline: transcribe + tag all unprocessed media.
 */
intelligenceRouter.post('/intelligence/analyze', async (req, res) => {
  const { projectId } = req.body;

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

  // Get media list from our own server
  const mediaRes = await fetch(`${serverUrl()}/api/media?projectId=${projectId}`);
  const mediaData = await mediaRes.json();
  const items = mediaData.data || [];

  const toTranscribe = items.filter((i) => {
    if (i.type !== 'video' && i.type !== 'audio') return false;
    const sidecar = `${i.filePath}.nearedit.json`;
    if (!existsSync(sidecar)) return true;
    try {
      const meta = JSON.parse(readFileSync(sidecar, 'utf-8'));
      return !meta.transcript;
    } catch { return true; }
  });

  const toTag = items.filter((i) => {
    if (i.type !== 'video') return false;
    const sidecar = `${i.filePath}.nearedit.json`;
    if (!existsSync(sidecar)) return true;
    try {
      const meta = JSON.parse(readFileSync(sidecar, 'utf-8'));
      return !meta.keyframes;
    } catch { return true; }
  });

  res.write(`data: ${JSON.stringify({ status: 'started', transcribe: toTranscribe.length, tag: toTag.length })}\n\n`);

  // Transcribe all
  for (let i = 0; i < toTranscribe.length; i++) {
    const item = toTranscribe[i];
    res.write(`data: ${JSON.stringify({ status: 'transcribing', file: item.filename, progress: `${i + 1}/${toTranscribe.length}` })}\n\n`);
    try {
      const url = fileUrl(item.filePath);
      const { stdout } = await sshExec(`${WHISPER_CMD} '${url}' --model ${WHISPER_MODEL}`, 600_000);
      const transcript = JSON.parse(stdout);
      const sidecar = loadSidecar(item.filePath);
      sidecar.transcript = transcript.words;
      sidecar.segments = transcript.segments;
      sidecar.language = transcript.language;
      saveSidecar(item.filePath, sidecar);
      res.write(`data: ${JSON.stringify({ status: 'transcribed', file: item.filename, words: transcript.words.length })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ status: 'error', file: item.filename, error: err.message })}\n\n`);
    }
  }

  // Tag all
  for (let i = 0; i < toTag.length; i++) {
    const item = toTag[i];
    res.write(`data: ${JSON.stringify({ status: 'tagging', file: item.filename, progress: `${i + 1}/${toTag.length}` })}\n\n`);
    try {
      const url = fileUrl(item.filePath);
      const { stdout } = await sshExec(`${TAGGER_CMD} '${url}' --frames 5 --model ${VISION_MODEL}`, 300_000);
      const result = JSON.parse(stdout);
      const sidecar = loadSidecar(item.filePath);
      sidecar.tags = result.tags || [];
      sidecar.keyframes = result.keyframes || [];
      saveSidecar(item.filePath, sidecar);
      res.write(`data: ${JSON.stringify({ status: 'tagged', file: item.filename, tags: result.tags.length })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ status: 'error', file: item.filename, error: err.message })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ status: 'complete' })}\n\n`);
  res.end();
});
