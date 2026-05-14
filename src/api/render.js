/**
 * Render route — accepts JSON EDL, produces FFmpeg command, executes render.
 * @module api/render
 */

import { Router } from 'express';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

export const renderRouter = Router();

const MEDIA_DIR = resolve(process.cwd(), 'media');
const OUTPUT_DIR = resolve(process.cwd(), 'data/renders');

/**
 * Build FFmpeg filter_complex args from an EDL timeline.
 * @param {object} edl - The JSON EDL object
 * @returns {{ inputs: string[], filterComplex: string, outputFile: string }}
 */
function buildFfmpegArgs(edl) {
  const inputs = [];
  const filters = [];
  const concatParts = [];
  let idx = 0;

  for (const track of edl.tracks) {
    for (const clip of track.clips) {
      const filePath = resolve(MEDIA_DIR, clip.sourceFile);
      inputs.push('-i', filePath);

      const trimFilter = track.type === 'audio'
        ? `[${idx}:a]atrim=start=${clip.sourceIn}:end=${clip.sourceOut},asetpts=PTS-STARTPTS[a${idx}]`
        : `[${idx}:v]trim=start=${clip.sourceIn}:end=${clip.sourceOut},setpts=PTS-STARTPTS[v${idx}]`;
      filters.push(trimFilter);
      concatParts.push(track.type === 'audio' ? `[a${idx}]` : `[v${idx}]`);
      idx++;
    }
  }

  const hasVideo = edl.tracks.some((t) => t.type === 'video');
  const hasAudio = edl.tracks.some((t) => t.type === 'audio');
  const concatN = concatParts.length;
  const concatType = hasVideo && hasAudio ? 'v=1:a=1' : hasVideo ? 'v=1:a=0' : 'v=0:a=1';
  filters.push(`${concatParts.join('')}concat=n=${concatN}:${concatType}[out]`);

  const outputFile = resolve(OUTPUT_DIR, `render_${Date.now()}.mp4`);
  return { inputs, filterComplex: filters.join(';'), outputFile };
}

/** POST /api/render — kick off an FFmpeg render from EDL JSON */
renderRouter.post('/render', (req, res) => {
  const edl = req.body;
  if (!edl?.tracks?.length) return res.status(422).json({ error: 'Invalid EDL: no tracks' });

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const { inputs, filterComplex, outputFile } = buildFfmpegArgs(edl);
  const args = [...inputs, '-filter_complex', filterComplex, '-map', '[out]', '-y', outputFile];

  execFile('ffmpeg', args, { timeout: 300_000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: 'Render failed', detail: stderr });
    res.json({ output: outputFile, log: stderr.slice(-500) });
  });
});

/** GET /api/render/status — placeholder for future queue-based renders */
renderRouter.get('/render/status', (_req, res) => {
  res.json({ queue: [], message: 'No active renders' });
});
