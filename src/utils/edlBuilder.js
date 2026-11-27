/**
 * EDL Builder — deterministic timeline assembly from segment selections.
 * Takes transcript segment indices + available media, produces word-aligned EDL.
 * No LLM needed for this step — pure math on word timestamps.
 * @module utils/edlBuilder
 */

/**
 * @typedef {Object} SegmentSelection
 * @property {number} segmentIndex - Index into the transcript segments array
 * @property {string} [videoMatch] - Preferred video file path (optional)
 */

/**
 * Build a timeline from selected transcript segments.
 * Snaps cuts to word boundaries with configurable padding.
 * @param {object[]} segments - Full transcript segments array from sidecar
 * @param {object[]} words - Full word-level timestamps from sidecar
 * @param {number[]} segmentIndices - Which segments to include (in order)
 * @param {object} opts
 * @param {string} opts.audioFile - Path to the narration source file
 * @param {object[]} opts.videoFiles - Available video files with tags
 * @param {number} [opts.padding=0.05] - Seconds of padding before/after word boundaries
 * @param {number} [opts.gapBetween=0.15] - Natural pause between segments
 * @returns {{ tracks: object[] }}
 */
export function buildEdlFromSegments(segments, words, segmentIndices, opts) {
  const { audioFile, videoFiles = [], padding = 0.05, gapBetween = 0.15 } = opts;
  const xform = {
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
  };

  const audioClips = [];
  const videoClips = [];
  let timelinePos = 0;

  for (let i = 0; i < segmentIndices.length; i++) {
    const idx = segmentIndices[i];
    const seg = segments[idx];
    if (!seg) continue;

    // Find exact word boundaries for this segment
    const segWords = words.filter((w) => w.start >= seg.start - 0.1 && w.end <= seg.end + 0.1);
    if (!segWords.length) continue;

    // Snap to first/last word with padding
    const sourceIn = Math.max(0, segWords[0].start - padding);
    const sourceOut = segWords[segWords.length - 1].end + padding;
    const duration = sourceOut - sourceIn;

    // Audio clip
    audioClips.push({
      clipId: `narr_${i}`,
      sourceFile: audioFile,
      sourceIn,
      sourceOut,
      timelineStart: timelinePos,
      timelineEnd: timelinePos + duration,
      fadeIn: 0,
      fadeOut: 0,
      linkedClipId: `broll_${i}`,
      placeholder: false,
      label: seg.text.slice(0, 40),
      prompt: '',
      intent: 'narration',
      color: '',
      transform: xform,
    });

    // Match a video clip by tags/content
    const video = matchVideoToSegment(seg, videoFiles, i);
    videoClips.push({
      clipId: `broll_${i}`,
      sourceFile: video?.filePath || '',
      sourceIn: 0,
      sourceOut: duration,
      timelineStart: timelinePos,
      timelineEnd: timelinePos + duration,
      fadeIn: 0,
      fadeOut: 0,
      linkedClipId: `narr_${i}`,
      placeholder: !video,
      label: video ? '' : `B-roll for: ${seg.text.slice(0, 30)}`,
      prompt: !video ? `Visual for: "${seg.text.slice(0, 60)}"` : '',
      intent: 'broll',
      color: '',
      transform: xform,
    });

    timelinePos += duration + gapBetween;
  }

  // Remove trailing gap
  if (audioClips.length) {
    const last = audioClips[audioClips.length - 1];
    timelinePos = last.timelineEnd;
  }

  return {
    tracks: [
      {
        trackId: 'v1',
        type: 'video',
        name: 'Video 1',
        muted: false,
        solo: false,
        clips: videoClips,
      },
      {
        trackId: 'a1',
        type: 'audio',
        name: 'Audio 1',
        muted: false,
        solo: false,
        clips: audioClips,
      },
    ],
  };
}

/**
 * Match a video file to a narration segment based on tag overlap.
 * Cycles through available videos to avoid repetition.
 * @param {object} segment
 * @param {object[]} videoFiles
 * @param {number} index - For cycling
 * @returns {object|null}
 */
function matchVideoToSegment(segment, videoFiles, index) {
  if (!videoFiles.length) return null;

  const segWords = segment.text.toLowerCase().split(/\s+/);

  // Score each video by tag overlap with segment text
  const scored = videoFiles.map((v) => {
    const tags = v.tags || [];
    const score = tags.reduce((s, tag) => {
      return s + (segWords.some((w) => w.includes(tag) || tag.includes(w)) ? 2 : 0);
    }, 0);
    return { ...v, score };
  });

  // Pick best match, or cycle if no good match
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score > 0) return scored[0];

  // No tag match — cycle through videos
  return videoFiles[index % videoFiles.length];
}

/**
 * Find the best contiguous segment range for a target duration.
 * @param {object[]} segments
 * @param {number} targetDuration
 * @param {number} [startAfter=30] - Skip first N seconds (intro noise)
 * @returns {number[]} segment indices
 */
export function selectSegmentsForDuration(segments, targetDuration, startAfter = 30) {
  const valid = segments.filter((s) => s.start >= startAfter);
  if (!valid.length) return [];

  // Find the best contiguous run that fits the target duration
  let bestStart = 0;
  let bestEnd = 0;
  let bestDiff = Infinity;

  for (let i = 0; i < valid.length; i++) {
    let dur = 0;
    for (let j = i; j < valid.length; j++) {
      dur += valid[j].end - valid[j].start;
      const diff = Math.abs(dur - targetDuration);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestStart = i;
        bestEnd = j;
      }
      if (dur > targetDuration * 1.2) break;
    }
  }

  // Map back to original segment indices
  const indices = [];
  for (let i = bestStart; i <= bestEnd; i++) {
    const seg = valid[i];
    const origIdx = segments.indexOf(seg);
    if (origIdx !== -1) indices.push(origIdx);
  }
  return indices;
}
