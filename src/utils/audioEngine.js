/**
 * Audio playback engine — the audio element is the clock source.
 * During playback, timeline position is derived FROM audio.currentTime.
 * This eliminates all drift/echo issues.
 * @module utils/audioEngine
 */

/** @type {HTMLAudioElement|null} */
let activeAudio = null;

/** @type {{ clip: object, track: object }|null} */
let activeClipInfo = null;

/** @type {Map<string, HTMLAudioElement>} preloaded audio elements */
const preloadPool = new Map();

/**
 * Get all audio clips sorted by timeline position.
 * @param {object[]} tracks
 * @returns {{ clip: object, track: object }[]}
 */
function getAllAudioClips(tracks) {
  const audioTracks = tracks.filter((t) => t.type === 'audio');
  const hasSolo = audioTracks.some((t) => t.solo);
  const clips = [];
  for (const track of audioTracks) {
    if (track.muted) continue;
    if (hasSolo && !track.solo) continue;
    for (const clip of track.clips) {
      if (!clip.sourceFile) continue;
      clips.push({ clip, track });
    }
  }
  return clips.sort((a, b) => a.clip.timelineStart - b.clip.timelineStart);
}

/**
 * Find the audio clip at a given timeline time.
 * @param {object[]} tracks
 * @param {number} time
 * @returns {{ clip: object, track: object }|null}
 */
function clipAtTime(tracks, time) {
  const all = getAllAudioClips(tracks);
  for (const entry of all) {
    if (time >= entry.clip.timelineStart && time < entry.clip.timelineEnd) {
      return entry;
    }
  }
  return null;
}

/**
 * Preload an audio element for a source file.
 * Uses transcoded WAV for compressed formats (accurate seeking).
 * @param {string} sourceFile
 * @returns {HTMLAudioElement}
 */
function getOrCreateAudio(sourceFile) {
  if (preloadPool.has(sourceFile)) return preloadPool.get(sourceFile);
  const audio = new Audio();
  audio.preload = 'auto';
  // Use transcode endpoint for compressed audio — serves WAV for accurate seeking
  const ext = sourceFile.split('.').pop().toLowerCase();
  const needsTranscode = ['mp3', 'aac', 'ogg', 'flac', 'm4a'].includes(ext);
  audio.src = needsTranscode
    ? `/api/transcode?path=${encodeURIComponent(sourceFile)}`
    : `/api/media/file?path=${encodeURIComponent(sourceFile)}`;
  preloadPool.set(sourceFile, audio);
  return audio;
}

/**
 * Start playback from a timeline position.
 * @param {object[]} tracks
 * @param {number} time
 */
export function startAudioPlayback(tracks, time) {
  stopAudioPlayback();
  const entry = clipAtTime(tracks, time);
  if (!entry) return;

  activeClipInfo = entry;
  activeAudio = getOrCreateAudio(entry.clip.sourceFile);
  activeAudio.currentTime = entry.clip.sourceIn + (time - entry.clip.timelineStart);
  activeAudio.play().catch(() => {});
}

/**
 * Get the current timeline time from the audio clock.
 * Returns null if not playing or no active clip.
 * @returns {number|null}
 */
export function getAudioTime() {
  if (!activeAudio || activeAudio.paused || !activeClipInfo) return null;
  const { clip } = activeClipInfo;
  return clip.timelineStart + (activeAudio.currentTime - clip.sourceIn);
}

/**
 * Check if we need to start/transition audio clips.
 * Handles: clip ended → next clip, silence → entering a clip.
 * @param {object[]} tracks
 * @param {number} currentTime - current timeline position
 * @returns {boolean} true if still playing
 */
export function tickAudio(tracks, currentTime) {
  const entry = clipAtTime(tracks, currentTime);

  // Case 1: No clip at current time
  if (!entry) {
    if (activeAudio && !activeAudio.paused) activeAudio.pause();
    activeClipInfo = null;
    activeAudio = null;
    return true; // still playing timeline, just silent
  }

  // Case 2: Same clip still playing
  if (
    activeClipInfo &&
    activeAudio &&
    entry.clip.clipId === activeClipInfo.clip.clipId &&
    entry.clip.timelineStart === activeClipInfo.clip.timelineStart
  ) {
    // Apply audio fade via volume
    const clip = entry.clip;
    const duration = clip.timelineEnd - clip.timelineStart;
    const timeInClip = currentTime - clip.timelineStart;
    const timeFromEnd = clip.timelineEnd - currentTime;
    let vol = 1;
    if (clip.fadeIn > 0 && timeInClip < clip.fadeIn) {
      vol = timeInClip / clip.fadeIn;
    }
    if (clip.fadeOut > 0 && timeFromEnd < clip.fadeOut) {
      vol = Math.min(vol, timeFromEnd / clip.fadeOut);
    }
    activeAudio.volume = Math.max(0, Math.min(1, vol));

    // Check if source has passed its out point
    const sourceEnd = clip.sourceOut || clip.sourceIn + duration;
    if (activeAudio.currentTime >= sourceEnd) {
      activeAudio.pause();
      activeClipInfo = null;
      activeAudio = null;
      // Recurse to pick up next clip immediately
      return tickAudio(tracks, currentTime);
    }
    return true;
  }

  // Case 3: New clip (entered from silence or transitioned from another)
  if (activeAudio && !activeAudio.paused) activeAudio.pause();
  activeClipInfo = entry;
  activeAudio = getOrCreateAudio(entry.clip.sourceFile);
  activeAudio.currentTime = entry.clip.sourceIn + (currentTime - entry.clip.timelineStart);
  activeAudio.play().catch(() => {});
  return true;
}

/**
 * Stop all audio.
 */
export function stopAudioPlayback() {
  if (activeAudio && !activeAudio.paused) activeAudio.pause();
  activeAudio = null;
  activeClipInfo = null;
}

/**
 * Seek without playing.
 * @param {object[]} tracks
 * @param {number} time
 */
export function seekAudio(tracks, time) {
  stopAudioPlayback();
  const entry = clipAtTime(tracks, time);
  if (!entry) return;
  const audio = getOrCreateAudio(entry.clip.sourceFile);
  audio.currentTime = entry.clip.sourceIn + (time - entry.clip.timelineStart);
}

/**
 * Clean up.
 */
export function destroyAudio() {
  stopAudioPlayback();
  for (const audio of preloadPool.values()) {
    audio.src = '';
    audio.load();
  }
  preloadPool.clear();
}
