/**
 * Silence removal — deterministic edit from word-level timestamps.
 * No LLM needed. Operates on transcript data to produce tight clips.
 *
 * Input: audio file path + sidecar with word timestamps
 * Output: array of clips with sourceIn/sourceOut that skip silence gaps
 *
 * @module utils/silenceRemoval
 */

/**
 * @typedef {Object} WordTimestamp
 * @property {string} word
 * @property {number} start
 * @property {number} end
 * @property {number} probability
 */

/**
 * @typedef {Object} SilenceRemovalOptions
 * @property {number} [threshold=0.8] - Gap longer than this (seconds) is considered silence
 * @property {number} [padding=0.1] - Breathing room before/after words (seconds)
 * @property {number} [minClipDuration=1.0] - Don't create clips shorter than this
 * @property {number} [maxGapToKeep=0.3] - Gaps shorter than this are natural pauses, keep them
 */

/**
 * Analyze transcript for silence gaps.
 * @param {WordTimestamp[]} words
 * @param {SilenceRemovalOptions} opts
 * @returns {{ gaps: { start: number, end: number, duration: number }[], totalSilence: number, totalSpeech: number }}
 */
export function analyzeGaps(words, opts = {}) {
  const threshold = opts.threshold ?? 0.8;
  const gaps = [];
  let totalSilence = 0;

  for (let i = 0; i < words.length - 1; i++) {
    const gapStart = words[i].end;
    const gapEnd = words[i + 1].start;
    const duration = gapEnd - gapStart;
    if (duration > threshold) {
      gaps.push({ start: gapStart, end: gapEnd, duration });
      totalSilence += duration;
    }
  }

  const totalSpeech = words.length > 0
    ? words[words.length - 1].end - words[0].start - totalSilence
    : 0;

  return { gaps, totalSilence, totalSpeech };
}

/**
 * Generate clips that skip silence gaps.
 * Each clip is a continuous spoken segment.
 * @param {WordTimestamp[]} words
 * @param {SilenceRemovalOptions} opts
 * @returns {{ clips: { sourceIn: number, sourceOut: number, text: string }[], removedDuration: number }}
 */
export function generateTightClips(words, opts = {}) {
  const threshold = opts.threshold ?? 0.8;
  const padding = opts.padding ?? 0.1;
  const minClipDuration = opts.minClipDuration ?? 1.0;
  const maxGapToKeep = opts.maxGapToKeep ?? 0.3;

  if (!words.length) return { clips: [], removedDuration: 0 };

  const clips = [];
  let clipStart = Math.max(0, words[0].start - padding);
  let clipWords = [words[0]];
  let removedDuration = 0;

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;

    if (gap > threshold) {
      // End current clip, start new one
      const clipEnd = words[i - 1].end + padding;
      const duration = clipEnd - clipStart;
      if (duration >= minClipDuration) {
        clips.push({
          sourceIn: clipStart,
          sourceOut: clipEnd,
          text: clipWords.map((w) => w.word).join(' '),
        });
      }
      removedDuration += gap - maxGapToKeep; // keep a tiny natural pause
      clipStart = words[i].start - padding;
      clipWords = [words[i]];
    } else {
      clipWords.push(words[i]);
    }
  }

  // Final clip
  const clipEnd = words[words.length - 1].end + padding;
  const duration = clipEnd - clipStart;
  if (duration >= minClipDuration) {
    clips.push({
      sourceIn: clipStart,
      sourceOut: clipEnd,
      text: clipWords.map((w) => w.word).join(' '),
    });
  }

  return { clips, removedDuration };
}

/**
 * Apply silence removal to a timeline — replaces an audio clip with
 * multiple tight clips on the same track.
 * @param {object} timeline - Current timeline state
 * @param {string} trackId - Which track to process
 * @param {string} clipId - Which clip to split
 * @param {WordTimestamp[]} words - Word timestamps for that clip's source
 * @param {SilenceRemovalOptions} opts
 * @returns {object} New timeline state with the clip replaced by tight segments
 */
export function applySilenceRemoval(timeline, trackId, clipId, words, opts = {}) {
  const tracks = timeline.tracks.map((track) => {
    if (track.trackId !== trackId) return track;

    const clipIdx = track.clips.findIndex((c) => c.clipId === clipId);
    if (clipIdx === -1) return track;

    const originalClip = track.clips[clipIdx];
    const { clips: tightClips } = generateTightClips(words, opts);

    // Map tight clips to timeline positions (end-to-end, starting at original's timelineStart)
    let timelinePos = originalClip.timelineStart;
    const newClips = tightClips.map((tc, i) => {
      const duration = tc.sourceOut - tc.sourceIn;
      const clip = {
        ...originalClip,
        clipId: `${originalClip.clipId}_seg${i}`,
        sourceIn: tc.sourceIn,
        sourceOut: tc.sourceOut,
        timelineStart: timelinePos,
        timelineEnd: timelinePos + duration,
        label: tc.text.slice(0, 40),
      };
      timelinePos += duration;
      return clip;
    });

    // Replace original clip with the tight segments
    const clips = [
      ...track.clips.slice(0, clipIdx),
      ...newClips,
      ...track.clips.slice(clipIdx + 1),
    ];

    return { ...track, clips };
  });

  return { ...timeline, tracks };
}

/**
 * Select the best segments from a transcript by topic/keyword matching.
 * Returns word ranges that match the query.
 * @param {object[]} segments - Transcript segments with { start, end, text }
 * @param {string} query - Keywords to search for
 * @param {number} maxDuration - Maximum total duration to select
 * @returns {{ segments: object[], totalDuration: number }}
 */
export function selectSegmentsByTopic(segments, query, maxDuration = 60) {
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!keywords.length) return { segments: [], totalDuration: 0 };

  // Score each segment by keyword matches
  const scored = segments.map((seg) => {
    const text = seg.text.toLowerCase();
    const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
    return { ...seg, score };
  }).filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // Select top segments up to maxDuration
  const selected = [];
  let totalDuration = 0;
  for (const seg of scored) {
    const dur = seg.end - seg.start;
    if (totalDuration + dur > maxDuration) continue;
    selected.push(seg);
    totalDuration += dur;
  }

  // Sort by time order
  selected.sort((a, b) => a.start - b.start);
  return { segments: selected, totalDuration };
}
