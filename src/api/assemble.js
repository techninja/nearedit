/**
 * EDL assembly endpoint — deterministic word-aligned timeline building.
 * Can be called directly (with segment indices) or after LLM segment selection.
 * @module api/assemble
 */

import { Router } from 'express';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const assembleRouter = Router();

/**
 * POST /api/assemble
 * Body: { projectId, audioFile, segmentIndices, targetDuration, padding, gapBetween }
 * If segmentIndices not provided, auto-selects for targetDuration.
 */
assembleRouter.post('/assemble', (req, res) => {
  const { projectId, audioFile, segmentIndices, targetDuration = 60, padding = 0.02, gapBetween = 0, startAfter = 30, minWordProb = 0.3 } = req.body;

  if (!audioFile) return res.status(400).json({ error: 'audioFile required' });

  const sidecarPath = `${audioFile}.nearedit.json`;
  if (!existsSync(sidecarPath)) return res.status(404).json({ error: 'No transcript sidecar found' });
  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf-8'));
  if (!sidecar.segments?.length || !sidecar.transcript?.length) {
    return res.status(422).json({ error: 'Sidecar missing segments or word timestamps' });
  }

  const videoFiles = getVideoFiles(projectId);
  let indices = segmentIndices;
  if (!indices || !indices.length) {
    indices = selectForDuration(sidecar.segments, targetDuration, startAfter);
  }

  const xform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, anchorX: 0.5, anchorY: 0.5 };
  const audioClips = [];
  let timelinePos = 0;

  // Build audio clips with tight word boundaries
  for (let i = 0; i < indices.length; i++) {
    const seg = sidecar.segments[indices[i]];
    if (!seg) continue;

    const segWords = sidecar.transcript.filter((w) => w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05);
    if (!segWords.length) continue;

    // Trim low-confidence edges
    let startWord = 0;
    let endWord = segWords.length - 1;
    while (startWord < segWords.length && segWords[startWord].probability < minWordProb) startWord++;
    while (endWord > startWord && segWords[endWord].probability < minWordProb) endWord--;
    if (startWord > endWord) continue;

    // Find the actual speech cluster — skip large intra-segment gaps
    // (e.g. "I" at 10s then silence until "was" at 19s)
    let trimmedWords = segWords.slice(startWord, endWord + 1);
    const maxIntraGap = 1.5; // seconds — any gap bigger than this means the earlier words are noise
    for (let w = 0; w < trimmedWords.length - 1; w++) {
      const gap = trimmedWords[w + 1].start - trimmedWords[w].end;
      if (gap > maxIntraGap) {
        // Keep only the words after the gap (the actual speech cluster)
        trimmedWords = trimmedWords.slice(w + 1);
        w = -1; // restart check on the remaining words
      }
    }
    if (!trimmedWords.length) continue;
    const sourceIn = Math.max(0, trimmedWords[0].start - padding);
    const sourceOut = trimmedWords[trimmedWords.length - 1].end + padding;
    const duration = sourceOut - sourceIn;

    audioClips.push({
      clipId: `narr_${i}`, sourceFile: audioFile, sourceIn, sourceOut,
      timelineStart: timelinePos, timelineEnd: timelinePos + duration,
      fadeIn: 0, fadeOut: 0, linkedClipId: '',
      placeholder: false, label: trimmedWords.map((w) => w.word).join(' ').slice(0, 50),
      prompt: '', intent: 'narration', color: '', transform: xform,
    });

    timelinePos += duration + gapBetween;
  }

  // Build video track — continuous coverage, no gaps
  const totalDuration = audioClips.length ? audioClips[audioClips.length - 1].timelineEnd : 0;
  const videoClips = buildVideoCoverage(videoFiles, totalDuration, audioClips, sidecar.segments, indices, xform);

  const edl = {
    tracks: [
      { trackId: 'v1', type: 'video', name: 'Video 1', muted: false, solo: false, clips: videoClips },
      { trackId: 'a1', type: 'audio', name: 'Audio 1', muted: false, solo: false, clips: audioClips },
    ],
  };

  res.json({ edl, segmentCount: indices.length, clipCount: audioClips.length, duration: totalDuration });
});

/**
 * Build video clips that cover the entire timeline duration with no gaps.
 * Matches video to narration content by tags, cycles through available clips.
 */
function buildVideoCoverage(videoFiles, totalDuration, audioClips, segments, indices, xform) {
  if (!videoFiles.length || totalDuration <= 0) return [];

  const clips = [];
  let timelinePos = 0;
  let videoIdx = 0;

  // Group audio clips into visual "scenes" (every 2-3 narration clips = 1 video clip)
  const sceneLength = Math.max(3, Math.ceil(totalDuration / videoFiles.length / 2));
  
  while (timelinePos < totalDuration) {
    // Find which narration is playing at this point for tag matching
    const currentAudio = audioClips.find((c) => c.timelineStart <= timelinePos && c.timelineEnd > timelinePos);
    const segIdx = currentAudio ? indices[audioClips.indexOf(currentAudio)] : null;
    const seg = segIdx !== null ? segments[segIdx] : null;

    // Pick video — match by tags or cycle
    const video = seg ? matchVideo(seg, videoFiles, videoIdx) : videoFiles[videoIdx % videoFiles.length];
    videoIdx++;

    // Duration: fill until next scene break or end of timeline
    const clipDur = Math.min(sceneLength, totalDuration - timelinePos, video.duration || sceneLength);

    // Build transform — ken burns for images, slight zoom for video
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes((video.filePath || '').split('.').pop().toLowerCase());
    const clipTransform = { ...xform };
    if (isImage) {
      // Ken burns: slow zoom in with slight pan
      const panDir = clips.length % 2 === 0 ? 1 : -1;
      clipTransform.kenBurns = {
        startX: 0, startY: 0, startScale: 1.0,
        endX: panDir * 20, endY: -10, endScale: 1.2,
        startCropTop: 0, startCropBottom: 0, startCropLeft: 0, startCropRight: 0,
        endCropTop: 0, endCropBottom: 0, endCropLeft: 0, endCropRight: 0,
      };
    } else {
      // Video: subtle slow zoom
      clipTransform.kenBurns = {
        startX: 0, startY: 0, startScale: 1.0,
        endX: 0, endY: 0, endScale: 1.05,
        startCropTop: 0, startCropBottom: 0, startCropLeft: 0, startCropRight: 0,
        endCropTop: 0, endCropBottom: 0, endCropLeft: 0, endCropRight: 0,
      };
    }

    clips.push({
      clipId: `broll_${clips.length}`,
      sourceFile: video.filePath,
      sourceIn: 0,
      sourceOut: clipDur,
      timelineStart: timelinePos,
      timelineEnd: timelinePos + clipDur,
      fadeIn: clips.length === 0 ? 0 : 0.3,
      fadeOut: 0,
      linkedClipId: '',
      placeholder: false,
      label: '',
      prompt: '',
      intent: 'broll',
      color: '',
      transform: clipTransform,
    });

    timelinePos += clipDur;
  }

  return clips;
}

/** Auto-select contiguous segments for a target duration, skipping intro */
function selectForDuration(segments, targetDuration, startAfter = 30) {
  const valid = segments.filter((s) => s.start >= startAfter);
  if (!valid.length) return [];

  let bestStart = 0, bestEnd = 0, bestDiff = Infinity;
  for (let i = 0; i < valid.length; i++) {
    let dur = 0;
    for (let j = i; j < valid.length; j++) {
      dur += valid[j].end - valid[j].start;
      const diff = Math.abs(dur - targetDuration);
      if (diff < bestDiff) { bestDiff = diff; bestStart = i; bestEnd = j; }
      if (dur > targetDuration * 1.2) break;
    }
  }

  return Array.from({ length: bestEnd - bestStart + 1 }, (_, i) => segments.indexOf(valid[bestStart + i]));
}

/** Match video to segment by tag overlap */
function matchVideo(segment, videoFiles, index) {
  if (!videoFiles.length) return null;
  const words = segment.text.toLowerCase().split(/\s+/);
  const scored = videoFiles.map((v) => ({
    ...v,
    score: (v.tags || []).reduce((s, t) => s + (words.some((w) => w.includes(t) || t.includes(w)) ? 1 : 0), 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0] : videoFiles[index % videoFiles.length];
}

/** Get video files with tags from project sidecars */
function getVideoFiles(projectId) {
  const regPath = resolve(process.cwd(), 'data/registry.json');
  if (!existsSync(regPath)) return [];
  const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
  const entry = reg[projectId];
  if (!entry?.path) return [];

  const files = [];
  function scan(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'scripts') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) { scan(full); continue; }
      if (e.name.endsWith('.nearedit.json')) {
        try {
          const s = JSON.parse(readFileSync(full, 'utf-8'));
          if (s.type === 'video' || s.type === 'image') {
            files.push({ filePath: full.replace('.nearedit.json', ''), ...s });
          }
        } catch {}
      }
    }
  }
  scan(entry.path);
  return files;
}
