/**
 * Timeline canvas drawing — renders tracks, clips, ruler, playhead.
 * Pure rendering, no interaction logic.
 * @module utils/timelineDraw
 */

import { timeToPx, pxToTime } from '#utils/timelineMath.js';
import { getSelection } from '#utils/clipInteractions.js';
import { onMessage } from '#utils/wsClient.js';
import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';

export const TRACK_HEIGHT = 56;
export const TRACK_GAP = 2;
export const HEADER_HEIGHT = 24;
export const TRACK_LABEL_W = 100;

/** Format seconds as M:SS.f */
function formatTimecode(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return `${m}:${sec}`;
}

const CLIP_COLORS = { video: '#3b82f6', audio: '#22c55e', image: '#f59e0b' };
const INTENT_COLORS = { narration: '#8b5cf6', broll: '#06b6d4', sfx: '#f97316', music: '#ec4899', title: '#eab308', transition: '#6b7280', '': '#64748b' };

/** @type {Map<string, { peaks: number[], duration: number }>} */
const waveformCache = new Map();
/** @type {Map<string, HTMLImageElement>} */
const thumbCache = new Map();

export function loadWaveform(filePath, cb) {
  if (waveformCache.has(filePath)) return;
  waveformCache.set(filePath, { peaks: [], duration: 0 });
  fetch(`/api/previews/waveform?path=${encodeURIComponent(filePath)}`)
    .then((r) => {
      if (r.status === 202) {
        const unsub = onMessage('job_update', (msg) => {
          if (msg.job.type !== 'waveform' || msg.job.status !== 'complete') return;
          if (msg.job.result?.path !== filePath) return;
          unsub();
          fetch(`/api/previews/waveform?path=${encodeURIComponent(filePath)}`)
            .then((r2) => r2.json())
            .then((d) => {
              waveformCache.set(filePath, { peaks: d.peaks || [], duration: d.duration || 0 });
              forceTimelineRedraw();
            });
        });
        return;
      }
      if (r.ok) r.json().then((d) => {
        waveformCache.set(filePath, { peaks: d.peaks || [], duration: d.duration || 0 });
        forceTimelineRedraw();
      });
    }).catch(() => {});
}

export function loadThumb(filePath, cb) {
  if (thumbCache.has(filePath)) return;
  const img = new Image();
  thumbCache.set(filePath, img);
  img.onload = () => forceTimelineRedraw();
  img.src = `/api/previews/thumbnail?path=${encodeURIComponent(filePath)}&cols=10&height=${TRACK_HEIGHT - 4}`;
}

/** Force a timeline redraw by touching the store. */
function forceTimelineRedraw() {
  const state = store.get(TimelineState);
  if (state) store.set(TimelineState, { ...state });
}

/** Reference to the canvas context for direct redraws during loading */
let _drawCtx = null;
let _drawW = 0;
let _drawH = 0;

/** Set the draw context for loading animations (called by timeline-canvas connect) */
export function setDrawContext(ctx, w, h) {
  _drawCtx = ctx; _drawW = w; _drawH = h;
}

/** Animation frame for loading states — redraws canvas directly, no store touch */
let loadingAnimFrame = 0;
function startLoadingAnim() {
  if (loadingAnimFrame) return;
  const tick = () => {
    let anyLoading = false;
    for (const [, v] of waveformCache) { if (!v.peaks?.length) { anyLoading = true; break; } }
    if (!anyLoading) for (const [, img] of thumbCache) { if (!img.complete) { anyLoading = true; break; } }
    if (anyLoading && _drawCtx) {
      const state = store.get(TimelineState);
      if (state) draw(_drawCtx, state, _drawW, _drawH, () => {});
      loadingAnimFrame = requestAnimationFrame(tick);
    } else {
      loadingAnimFrame = 0;
    }
  };
  loadingAnimFrame = requestAnimationFrame(tick);
}

export function sortTracks(tracks) {
  return [...tracks].sort((a, b) => {
    if (a.type === 'audio' && b.type !== 'audio') return 1;
    if (a.type !== 'audio' && b.type === 'audio') return -1;
    return 0;
  });
}

/**
 * Draw the full timeline.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} w
 * @param {number} h
 * @param {() => void} redraw
 */
export function draw(ctx, state, w, h, redraw) {
  const { tracks, zoom, scrollX, playheadPosition } = state;
  ctx.clearRect(0, 0, w, h);
  const sorted = sortTracks(tracks);
  const sel = getSelection();

  // Ruler
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(TRACK_LABEL_W, 0, w - TRACK_LABEL_W, HEADER_HEIGHT);
  ctx.strokeStyle = '#475569';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px system-ui';
  const step = zoom >= 2 ? 1 : zoom >= 0.5 ? 5 : 10;
  for (let s = 0; s < pxToTime(w + scrollX, zoom) + step; s += step) {
    const x = TRACK_LABEL_W + timeToPx(s, zoom) - scrollX;
    if (x < TRACK_LABEL_W) continue;
    ctx.beginPath(); ctx.moveTo(x, HEADER_HEIGHT - 6); ctx.lineTo(x, HEADER_HEIGHT); ctx.stroke();
    ctx.fillText(`${s}s`, x + 2, HEADER_HEIGHT - 8);
  }

  const videoCount = sorted.filter((t) => t.type !== 'audio').length;

  sorted.forEach((track, ti) => {
    const y = HEADER_HEIGHT + ti * (TRACK_HEIGHT + TRACK_GAP);
    const alpha = track.muted ? 0.35 : 1;

    // Track label
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, y, TRACK_LABEL_W, TRACK_HEIGHT);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 10px system-ui';
    ctx.fillText(track.name || `${track.type} ${ti + 1}`, 6, y + 13, TRACK_LABEL_W - 12);
    ctx.font = '9px system-ui';
    ctx.fillStyle = track.muted ? '#ef4444' : '#475569'; ctx.fillText('M', 8, y + TRACK_HEIGHT - 6);
    ctx.fillStyle = track.solo ? '#f59e0b' : '#475569'; ctx.fillText('S', 24, y + TRACK_HEIGHT - 6);
    ctx.globalAlpha = 1;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#0f172a44';
    ctx.fillRect(TRACK_LABEL_W, y, w - TRACK_LABEL_W, TRACK_HEIGHT);

    for (const clip of track.clips) {
      const isPlaceholder = clip.placeholder || !clip.sourceFile;
      if (!isPlaceholder && !clip.sourceFile) continue;
      const cx = TRACK_LABEL_W + timeToPx(clip.timelineStart, zoom) - scrollX;
      const cw = timeToPx(clip.timelineEnd - clip.timelineStart, zoom);
      const cy = y + 2;
      const ch = TRACK_HEIGHT - 4;
      const isSelected = sel && sel.clipId === clip.clipId;

      if (isPlaceholder) {
        drawPlaceholder(ctx, clip, cx, cy, cw, ch, alpha, zoom);
        continue;
      }

      // Clip background
      ctx.fillStyle = CLIP_COLORS[track.type] || CLIP_COLORS.video;
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillRect(cx, cy, cw, ch);
      ctx.globalAlpha = alpha;

      // Content preview
      if (track.type === 'audio') {
        drawWaveform(ctx, clip, cx, cy, cw, ch, redraw);
      } else {
        drawThumbnails(ctx, clip, cx, cy, cw, ch, alpha, redraw);
      }

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = '10px system-ui';
      ctx.fillText(clip.label || clip.sourceFile.split('/').pop().replace(/\.[^.]+$/, '').slice(0, 22), cx + 4, cy + 12, cw - 8);

      // Source in/out labels at bottom
      ctx.fillStyle = '#ffffffaa';
      ctx.font = '9px monospace';
      ctx.fillText(formatTimecode(clip.sourceIn), cx + 4, cy + ch - 3);
      const outLabel = formatTimecode(clip.sourceOut);
      const outWidth = ctx.measureText(outLabel).width;
      ctx.fillText(outLabel, cx + cw - outWidth - 4, cy + ch - 3);

      // Selection highlight
      if (isSelected) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, cw, ch);
        ctx.lineWidth = 1;
      }

      // Fades
      if (clip.fadeIn > 0) { ctx.strokeStyle = '#ffffffaa'; ctx.beginPath(); ctx.moveTo(cx, cy + ch); ctx.lineTo(cx + timeToPx(clip.fadeIn, zoom), cy); ctx.stroke(); }
      if (clip.fadeOut > 0) { ctx.strokeStyle = '#ffffffaa'; ctx.beginPath(); ctx.moveTo(cx + cw - timeToPx(clip.fadeOut, zoom), cy); ctx.lineTo(cx + cw, cy + ch); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  });

  // Separator
  if (videoCount > 0 && sorted.length > videoCount) {
    const sepY = HEADER_HEIGHT + videoCount * (TRACK_HEIGHT + TRACK_GAP);
    ctx.strokeStyle = '#475569'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, sepY); ctx.lineTo(w, sepY); ctx.stroke(); ctx.setLineDash([]);
  }

  // Playhead
  const px = TRACK_LABEL_W + timeToPx(playheadPosition, zoom) - scrollX;
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 7); ctx.closePath(); ctx.fill();
}

function drawPlaceholder(ctx, clip, cx, cy, cw, ch, alpha, zoom) {
  const color = clip.color || INTENT_COLORS[clip.intent] || INTENT_COLORS[''];
  ctx.fillStyle = color; ctx.globalAlpha = alpha * 0.4; ctx.fillRect(cx, cy, cw, ch);
  ctx.globalAlpha = alpha * 0.3; ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let hx = cx - ch; hx < cx + cw; hx += 8) { ctx.beginPath(); ctx.moveTo(hx, cy + ch); ctx.lineTo(hx + ch, cy); ctx.stroke(); }
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(cx, cy, cw, ch); ctx.setLineDash([]); ctx.lineWidth = 1;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui'; ctx.fillText(clip.label || clip.intent || 'placeholder', cx + 4, cy + 13, cw - 8);
  if (clip.prompt) { ctx.font = '9px system-ui'; ctx.fillStyle = '#ffffffaa'; ctx.fillText(clip.prompt.slice(0, 30), cx + 4, cy + 25, cw - 8); }
}

function drawWaveform(ctx, clip, cx, cy, cw, ch, redraw) {
  const cached = waveformCache.get(clip.sourceFile);
  if (cached?.peaks?.length) {
    const { peaks, duration: totalDur } = cached;
    const mid = cy + ch / 2;
    const fileDur = totalDur || clip.sourceOut || 1;
    const startIdx = Math.floor((clip.sourceIn / fileDur) * peaks.length);
    const endIdx = Math.ceil((clip.sourceOut / fileDur) * peaks.length);
    const visiblePeaks = peaks.slice(startIdx, Math.min(endIdx, peaks.length));
    if (!visiblePeaks.length) return;
    let maxPeak = 0;
    for (const p of visiblePeaks) { if (p > maxPeak) maxPeak = p; }
    const scale = maxPeak > 0 ? 1 / maxPeak : 1;
    ctx.fillStyle = '#ffffff55';
    for (let i = 0; i < visiblePeaks.length; i++) {
      const bx = cx + (i / visiblePeaks.length) * cw;
      const bh = (visiblePeaks[i] * scale) * (ch / 2 - 2);
      ctx.fillRect(bx, mid - bh, Math.max(1, cw / visiblePeaks.length) - 0.5, bh * 2);
    }
  } else {
    // Loading state — pulsing bar
    const mid = cy + ch / 2;
    ctx.fillStyle = '#ffffff22';
    const pulse = (Math.sin(Date.now() / 400) + 1) / 2;
    ctx.fillRect(cx + 4, mid - 2, (cw - 8) * pulse, 4);
    ctx.fillStyle = '#ffffff44';
    ctx.font = '9px system-ui';
    ctx.fillText('Loading waveform...', cx + 4, cy + ch - 4);
    loadWaveform(clip.sourceFile, forceTimelineRedraw);
    startLoadingAnim();
  }
}

function drawThumbnails(ctx, clip, cx, cy, cw, ch, alpha, redraw) {
  const img = thumbCache.get(clip.sourceFile);
  if (img?.complete && img.naturalWidth) {
    const cols = 10;
    const fw = img.naturalWidth / cols;
    const sourceDur = clip.sourceOut - clip.sourceIn;
    const clipDur = clip.timelineEnd - clip.timelineStart;
    const repeats = sourceDur > 0 ? Math.ceil(clipDur / sourceDur) : 1;
    ctx.globalAlpha = alpha * 0.4;
    for (let r = 0; r < repeats; r++) {
      const repeatOffset = (r * sourceDur / clipDur) * cw;
      const repeatWidth = Math.min(cw - repeatOffset, (sourceDur / clipDur) * cw);
      const tw = repeatWidth / cols;
      for (let i = 0; i < cols; i++) {
        const dx = cx + repeatOffset + i * tw;
        if (dx >= cx + cw) break;
        ctx.drawImage(img, i * fw, 0, fw, img.naturalHeight, dx, cy, tw, ch);
      }
    }
    ctx.globalAlpha = alpha;
  } else {
    // Loading state
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = '#ffffff11';
    const shimmer = (Math.sin(Date.now() / 300 + cx) + 1) / 2;
    ctx.fillRect(cx, cy, cw * shimmer * 0.3, ch);
    ctx.fillStyle = '#ffffff44';
    ctx.font = '9px system-ui';
    ctx.fillText('Loading...', cx + 4, cy + ch - 4);
    ctx.globalAlpha = alpha;
    loadThumb(clip.sourceFile, forceTimelineRedraw);
    startLoadingAnim();
  }
}
