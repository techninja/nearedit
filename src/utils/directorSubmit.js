/**
 * Director submission logic — handles action execution.
 * Deterministic actions run locally, LLM actions submit background jobs.
 * @module utils/directorSubmit
 */

import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { onMessage } from '#utils/wsClient.js';

/**
 * Execute the "remove silence" action deterministically.
 * @param {object} timeline
 * @param {object} params
 * @param {(msg: string) => void} onStatus
 * @returns {Promise<boolean>} success
 */
export async function executeSilenceRemoval(timeline, params, onStatus) {
  onStatus('Analyzing audio...');
  const audioTrack = timeline.tracks.find((t) => t.type === 'audio');
  if (!audioTrack?.clips?.length) { onStatus('No audio clips to process'); return false; }

  let allNewClips = [];
  let totalRemoved = 0;
  let timelinePos = 0;

  for (const clip of audioTrack.clips) {
    if (!clip.sourceFile || clip.placeholder) {
      const dur = clip.timelineEnd - clip.timelineStart;
      allNewClips.push({ ...clip, timelineStart: timelinePos, timelineEnd: timelinePos + dur });
      timelinePos += dur;
      continue;
    }

    const res = await fetch('/api/silence/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: clip.sourceFile,
        threshold: params.threshold,
        padding: params.padding,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
        timelineStart: timelinePos,
        maxDuration: 0,
      }),
    });
    const result = await res.json();
    if (result.error) { onStatus(`Error: ${result.error}`); return false; }

    allNewClips.push(...result.clips);
    totalRemoved += result.removedDuration;
    timelinePos = result.clips.length ? result.clips[result.clips.length - 1].timelineEnd : timelinePos;
  }

  onStatus(`Removed ${totalRemoved.toFixed(1)}s silence, ${allNewClips.length} segments`);
  const tracks = timeline.tracks.map((t) => t.type !== 'audio' ? t : { ...t, clips: allNewClips });
  store.set(TimelineState, { ...timeline, tracks });
  return true;
}

/**
 * Submit an LLM director job and listen for completion via WebSocket.
 * @param {object} directive
 * @param {string} projectId
 * @param {object} timeline
 * @param {boolean} replace
 * @param {(msg: string) => void} onStatus
 * @param {() => void} onComplete
 * @param {(err: string) => void} onError
 */
export async function submitDirectorJob(directive, projectId, timeline, replace, onStatus, onComplete, onError) {
  // For generate_script, use a different endpoint that returns markdown
  const endpoint = directive.action === 'generate_script' ? '/api/director/script' : '/api/director';

  const submitRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directive, projectId }),
  });
  const { jobId, error } = await submitRes.json();
  if (error) { onError(error); return; }

  // Immediately show a placeholder on the timeline
  const targetDuration = directive.params.duration || 60;
  if (replace) {
    const placeholderTracks = [
      { trackId: 'v1', type: 'video', name: 'Video 1', muted: false, solo: false, clips: [{
        clipId: `pending_${jobId.slice(0, 8)}`, sourceFile: '', sourceIn: 0, sourceOut: targetDuration,
        timelineStart: 0, timelineEnd: targetDuration, fadeIn: 0, fadeOut: 0, linkedClipId: '',
        placeholder: true, label: 'Generating edit...', prompt: '', intent: 'broll', color: '#6366f1',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, anchorX: 0.5, anchorY: 0.5 },
      }] },
      { trackId: 'a1', type: 'audio', name: 'Audio 1', muted: false, solo: false, clips: [{
        clipId: `pending_a_${jobId.slice(0, 8)}`, sourceFile: '', sourceIn: 0, sourceOut: targetDuration,
        timelineStart: 0, timelineEnd: targetDuration, fadeIn: 0, fadeOut: 0, linkedClipId: '',
        placeholder: true, label: 'Generating narration...', prompt: '', intent: 'narration', color: '#8b5cf6',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, anchorX: 0.5, anchorY: 0.5 },
      }] },
    ];
    store.set(TimelineState, { ...timeline, tracks: placeholderTracks });
  }

  onStatus('Job submitted...');

  const unsub = onMessage('job_update', async (msg) => {
    if (msg.job.id !== jobId) return;
    const job = msg.job;

    if (job.status === 'running') {
      const lastLog = job.log?.[job.log.length - 1] || 'Working...';
      onStatus(`${lastLog} (${job.progress}%)`);
    } else if (job.status === 'complete') {
      unsub();
      const resultRes = await fetch(`/api/jobs/${jobId}/result`);
      const result = await resultRes.json();
      // Script jobs return { scripts: [...] } — show selection UI
      if (result.scripts) {
        onStatus(`${result.count} scripts ready — load one via "Execute Script"`);
        // Refresh text files list so new scripts appear in dropdown
        const panel = document.querySelector('director-panel');
        if (panel) {
          const editor = document.querySelector('editor-view');
          const pid = editor?.projectId || '';
          fetch(`/api/media?projectId=${pid}`).then((r) => r.json()).then((d) => { panel.textFiles = (d.data || []).filter((f) => f.type === 'text'); });
          // Switch to Execute Script action so user sees the dropdown
          panel.action = 'execute_script';
          panel.collapsed = false;
        }
        onComplete();
      } else {
        applyEdl(timeline, result, replace);
        onComplete();
      }
    } else if (job.status === 'error') {
      unsub();
      onError(job.error);
    }
  });
}

/**
 * Apply an EDL result to the timeline (replace or append).
 * @param {object} timeline
 * @param {object} edl
 * @param {boolean} replace
 */
function applyEdl(timeline, edl, replace) {
  if (replace) {
    store.set(TimelineState, { ...timeline, ...edl });
  } else {
    const existingEnd = timeline.tracks.reduce((max, t) =>
      Math.max(max, t.clips.reduce((m, c) => Math.max(m, c.timelineEnd), 0)), 0);
    const merged = edl.tracks.map((newTrack) => {
      const existing = timeline.tracks.find((t) => t.type === newTrack.type);
      if (!existing) return newTrack;
      const offsetClips = newTrack.clips.map((c) => ({
        ...c,
        timelineStart: c.timelineStart + existingEnd,
        timelineEnd: c.timelineEnd + existingEnd,
      }));
      return { ...existing, clips: [...existing.clips, ...offsetClips] };
    });
    store.set(TimelineState, { ...timeline, tracks: merged });
  }
}
