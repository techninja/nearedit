/**
 * Silence removal API — deterministic, no LLM.
 * Reads word timestamps from sidecar, produces tight clips.
 * @module api/silence
 */

import { Router } from 'express';
import { existsSync, readFileSync } from 'node:fs';

export const silenceRouter = Router();

/**
 * POST /api/silence/analyze
 * Body: { filePath, threshold, padding }
 * Returns gap analysis for a file.
 */
silenceRouter.post('/silence/analyze', (req, res) => {
  const { filePath, threshold = 0.8 } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath required' });

  const sidecarPath = `${filePath}.nearedit.json`;
  if (!existsSync(sidecarPath))
    return res.status(404).json({ error: 'No sidecar/transcript found. Run transcription first.' });

  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf-8'));
  const words = sidecar.transcript;
  if (!words?.length) return res.status(422).json({ error: 'No word-level transcript in sidecar' });

  // Analyze gaps
  const gaps = [];
  let totalSilence = 0;
  for (let i = 0; i < words.length - 1; i++) {
    const gapStart = words[i].end;
    const gapEnd = words[i + 1].start;
    const duration = gapEnd - gapStart;
    if (duration > threshold) {
      gaps.push({ start: gapStart, end: gapEnd, duration: Math.round(duration * 100) / 100 });
      totalSilence += duration;
    }
  }

  const totalDuration = sidecar.transcriptDuration || sidecar.duration || 0;
  const speechDuration = totalDuration - totalSilence;

  res.json({
    totalDuration: Math.round(totalDuration * 10) / 10,
    totalSilence: Math.round(totalSilence * 10) / 10,
    speechDuration: Math.round(speechDuration * 10) / 10,
    compressionRatio: totalDuration > 0 ? Math.round((speechDuration / totalDuration) * 100) : 100,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 50), // first 50 for preview
  });
});

/**
 * POST /api/silence/remove
 * Body: { filePath, threshold, padding, minClipDuration, maxGapToKeep, timelineStart }
 * Returns array of tight clips ready to place on timeline.
 */
silenceRouter.post('/silence/remove', (req, res) => {
  const {
    filePath,
    threshold = 0.8,
    padding = 0.1,
    minClipDuration = 1.0,
    maxGapToKeep = 0.3,
    timelineStart = 0,
    sourceIn = 0,
    sourceOut = 0,
    maxDuration = 0,
  } = req.body;

  if (!filePath) return res.status(400).json({ error: 'filePath required' });

  const sidecarPath = `${filePath}.nearedit.json`;
  if (!existsSync(sidecarPath)) return res.status(404).json({ error: 'No transcript found' });

  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf-8'));
  let words = sidecar.transcript;
  if (!words?.length) return res.status(422).json({ error: 'No word-level transcript' });

  // Filter words to sourceIn/sourceOut range if specified
  if (sourceOut > sourceIn) {
    words = words.filter((w) => w.start >= sourceIn && w.end <= sourceOut);
  }
  if (!words.length)
    return res.json({
      clips: [],
      clipCount: 0,
      originalDuration: 0,
      outputDuration: 0,
      removedDuration: 0,
    });

  // Generate tight clips
  const clips = [];
  let clipStart = Math.max(0, words[0].start - padding);
  let clipWords = [words[0]];
  let removedDuration = 0;
  let timelinePos = timelineStart;
  let totalOutputDuration = 0;

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;

    if (gap > threshold) {
      const clipEnd = words[i - 1].end + padding;
      const duration = clipEnd - clipStart;
      if (duration >= minClipDuration) {
        if (maxDuration > 0 && totalOutputDuration + duration > maxDuration) break;
        clips.push({
          clipId: `silence_rm_${clips.length}`,
          sourceFile: filePath,
          sourceIn: Math.round(clipStart * 1000) / 1000,
          sourceOut: Math.round(clipEnd * 1000) / 1000,
          timelineStart: Math.round(timelinePos * 1000) / 1000,
          timelineEnd: Math.round((timelinePos + duration) * 1000) / 1000,
          fadeIn: 0,
          fadeOut: 0,
          linkedClipId: '',
          placeholder: false,
          label: clipWords
            .map((w) => w.word)
            .join(' ')
            .slice(0, 50),
          prompt: '',
          intent: 'narration',
          color: '',
          transform: {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 1,
            cropTop: 0,
            cropBottom: 0,
            cropLeft: 0,
            cropRight: 0,
            anchorX: 0.5,
            anchorY: 0.5,
          },
        });
        timelinePos += duration;
        totalOutputDuration += duration;
      }
      removedDuration += gap;
      clipStart = words[i].start - padding;
      clipWords = [words[i]];
    } else {
      clipWords.push(words[i]);
    }
  }

  // Final clip
  const clipEnd = words[words.length - 1].end + padding;
  const duration = clipEnd - clipStart;
  if (
    duration >= minClipDuration &&
    (maxDuration === 0 || totalOutputDuration + duration <= maxDuration)
  ) {
    clips.push({
      clipId: `silence_rm_${clips.length}`,
      sourceFile: filePath,
      sourceIn: Math.round(clipStart * 1000) / 1000,
      sourceOut: Math.round(clipEnd * 1000) / 1000,
      timelineStart: Math.round(timelinePos * 1000) / 1000,
      timelineEnd: Math.round((timelinePos + duration) * 1000) / 1000,
      fadeIn: 0,
      fadeOut: 0,
      linkedClipId: '',
      placeholder: false,
      label: clipWords
        .map((w) => w.word)
        .join(' ')
        .slice(0, 50),
      prompt: '',
      intent: 'narration',
      color: '',
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      },
    });
    totalOutputDuration += duration;
  }

  res.json({
    clips,
    clipCount: clips.length,
    originalDuration: Math.round((sidecar.transcriptDuration || sidecar.duration || 0) * 10) / 10,
    outputDuration: Math.round(totalOutputDuration * 10) / 10,
    removedDuration: Math.round(removedDuration * 10) / 10,
  });
});

/**
 * POST /api/silence/select
 * Body: { filePath, query, maxDuration }
 * Returns segments matching keywords from the transcript.
 */
silenceRouter.post('/silence/select', (req, res) => {
  const { filePath, query, maxDuration = 60 } = req.body;
  if (!filePath || !query) return res.status(400).json({ error: 'filePath and query required' });

  const sidecarPath = `${filePath}.nearedit.json`;
  if (!existsSync(sidecarPath)) return res.status(404).json({ error: 'No transcript found' });

  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf-8'));
  const segments = sidecar.segments;
  if (!segments?.length) return res.status(422).json({ error: 'No segments in transcript' });

  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

  // Score and select
  const scored = segments
    .map((seg) => {
      const text = seg.text.toLowerCase();
      const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
      return { ...seg, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = [];
  let totalDuration = 0;
  for (const seg of scored) {
    const dur = seg.end - seg.start;
    if (totalDuration + dur > maxDuration) continue;
    selected.push(seg);
    totalDuration += dur;
  }

  selected.sort((a, b) => a.start - b.start);
  res.json({
    segments: selected,
    totalDuration: Math.round(totalDuration * 10) / 10,
    totalMatches: scored.length,
  });
});
