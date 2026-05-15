/**
 * Timeline canvas — renders layered tracks/clips on a 2D canvas.
 * Video tracks on top, audio on bottom. Redraws on every state change.
 * @module components/organisms/timeline-canvas
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { timeToPx, pxToTime, snapToFrame } from '#utils/timelineMath.js';
import { pushState } from '#utils/undoHistory.js';

const TRACK_HEIGHT = 56;
const TRACK_GAP = 2;
const HEADER_HEIGHT = 24;
const TRACK_LABEL_W = 100;
const CLIP_COLORS = { video: '#3b82f6', audio: '#22c55e', image: '#f59e0b' };
const INTENT_COLORS = {
  narration: '#8b5cf6',
  broll: '#06b6d4',
  sfx: '#f97316',
  music: '#ec4899',
  title: '#eab308',
  transition: '#6b7280',
  '': '#64748b',
};

/** @type {Map<string, number[]>} */
const waveformCache = new Map();
/** @type {Map<string, HTMLImageElement>} */
const thumbCache = new Map();

/** @param {string} filePath @param {() => void} cb */
function loadWaveform(filePath, cb) {
  if (waveformCache.has(filePath)) return;
  waveformCache.set(filePath, []);
  fetch(`/api/previews/waveform?path=${encodeURIComponent(filePath)}&samples=800`)
    .then((r) => r.json())
    .then((d) => { waveformCache.set(filePath, d.peaks || []); cb(); })
    .catch(() => {});
}

/** @param {string} filePath @param {() => void} cb */
function loadThumb(filePath, cb) {
  if (thumbCache.has(filePath)) return;
  const img = new Image();
  thumbCache.set(filePath, img);
  img.onload = cb;
  img.src = `/api/previews/thumbnail?path=${encodeURIComponent(filePath)}&cols=10&height=${TRACK_HEIGHT - 4}`;
}

/** Sort tracks: video/image first, audio last */
function sortTracks(tracks) {
  return [...tracks].sort((a, b) => {
    if (a.type === 'audio' && b.type !== 'audio') return 1;
    if (a.type !== 'audio' && b.type === 'audio') return -1;
    return 0;
  });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} w
 * @param {number} h
 * @param {() => void} redraw
 */
function draw(ctx, state, w, h, redraw) {
  const { tracks, zoom, scrollX, playheadPosition } = state;
  ctx.clearRect(0, 0, w, h);
  const sorted = sortTracks(tracks);

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
    ctx.beginPath();
    ctx.moveTo(x, HEADER_HEIGHT - 6);
    ctx.lineTo(x, HEADER_HEIGHT);
    ctx.stroke();
    ctx.fillText(`${s}s`, x + 2, HEADER_HEIGHT - 8);
  }

  // Video/audio separator
  const videoCount = sorted.filter((t) => t.type !== 'audio').length;
  const sepY = HEADER_HEIGHT + videoCount * (TRACK_HEIGHT + TRACK_GAP);

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
    // M / S buttons
    ctx.font = '9px system-ui';
    ctx.fillStyle = track.muted ? '#ef4444' : '#475569';
    ctx.fillText('M', 8, y + TRACK_HEIGHT - 6);
    ctx.fillStyle = track.solo ? '#f59e0b' : '#475569';
    ctx.fillText('S', 24, y + TRACK_HEIGHT - 6);
    ctx.globalAlpha = 1;

    // Track bg
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

      if (isPlaceholder) {
        // Placeholder clip — hatched background with intent color
        const color = clip.color || INTENT_COLORS[clip.intent] || INTENT_COLORS[''];
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha * 0.4;
        ctx.fillRect(cx, cy, cw, ch);
        // Diagonal hatch pattern
        ctx.globalAlpha = alpha * 0.3;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        for (let hx = cx - ch; hx < cx + cw; hx += 8) {
          ctx.beginPath();
          ctx.moveTo(hx, cy + ch);
          ctx.lineTo(hx + ch, cy);
          ctx.stroke();
        }
        ctx.globalAlpha = alpha;
        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(cx, cy, cw, ch);
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui';
        const label = clip.label || clip.intent || 'placeholder';
        ctx.fillText(label, cx + 4, cy + 13, cw - 8);
        // Prompt preview (smaller, below label)
        if (clip.prompt) {
          ctx.font = '9px system-ui';
          ctx.fillStyle = '#ffffffaa';
          ctx.fillText(clip.prompt.slice(0, 30) + (clip.prompt.length > 30 ? '...' : ''), cx + 4, cy + 25, cw - 8);
        }
        continue;
      }

      // Real clip — existing rendering
      ctx.fillStyle = CLIP_COLORS[track.type] || CLIP_COLORS.video;
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillRect(cx, cy, cw, ch);
      ctx.globalAlpha = alpha;

      // Waveform / thumbnails
      if (track.type === 'audio') {
        const peaks = waveformCache.get(clip.sourceFile);
        if (peaks?.length) {
          const mid = cy + ch / 2;
          ctx.fillStyle = '#ffffff55';
          for (let i = 0; i < peaks.length; i++) {
            const bx = cx + (i / peaks.length) * cw;
            const bw = Math.max(1, cw / peaks.length);
            const bh = peaks[i] * (ch / 2 - 2);
            ctx.fillRect(bx, mid - bh, bw - 0.5, bh * 2);
          }
        } else { loadWaveform(clip.sourceFile, redraw); }
      } else {
        const img = thumbCache.get(clip.sourceFile);
        if (img?.complete && img.naturalWidth) {
          const cols = 10;
          const fw = img.naturalWidth / cols;
          const tw = cw / cols;
          ctx.globalAlpha = alpha * 0.4;
          for (let i = 0; i < cols; i++) {
            ctx.drawImage(img, i * fw, 0, fw, img.naturalHeight, cx + i * tw, cy, tw, ch);
          }
          ctx.globalAlpha = alpha;
        } else { loadThumb(clip.sourceFile, redraw); }
      }

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = '10px system-ui';
      ctx.fillText(clip.sourceFile.replace(/\.[^.]+$/, '').slice(0, 18), cx + 4, cy + 12, cw - 8);

      // Fades
      if (clip.fadeIn > 0) {
        ctx.strokeStyle = '#ffffffaa';
        ctx.beginPath();
        ctx.moveTo(cx, cy + ch);
        ctx.lineTo(cx + timeToPx(clip.fadeIn, zoom), cy);
        ctx.stroke();
      }
      if (clip.fadeOut > 0) {
        ctx.strokeStyle = '#ffffffaa';
        ctx.beginPath();
        ctx.moveTo(cx + cw - timeToPx(clip.fadeOut, zoom), cy);
        ctx.lineTo(cx + cw, cy + ch);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  });

  // Separator line
  if (videoCount > 0 && sorted.length > videoCount) {
    ctx.strokeStyle = '#475569';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, sepY);
    ctx.lineTo(w, sepY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Playhead
  const px = TRACK_LABEL_W + timeToPx(playheadPosition, zoom) - scrollX;
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, h);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(px - 5, 0);
  ctx.lineTo(px + 5, 0);
  ctx.lineTo(px, 7);
  ctx.closePath();
  ctx.fill();
}

export default define({
  tag: 'timeline-canvas',
  timeline: {
    ...store(TimelineState),
    observe(host, val) {
      if (!host._ctx || !val) return;
      const canvas = host.querySelector('canvas');
      if (!canvas) return;
      draw(host._ctx, val, canvas.width, canvas.height, () => {
        // Async preview loaded — redraw with current state
        const s = store.get(TimelineState);
        if (s && host._ctx) draw(host._ctx, s, canvas.width, canvas.height, () => {});
      });
    },
  },
  _ctx: { value: null, connect: () => {} },
  render: {
    value: ({ timeline }) => html`
      <div class="timeline-canvas-wrap"
        onmousedown="${(host, e) => {
          const canvas = host.querySelector('canvas');
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          // Track label: mute/solo toggle
          if (x < TRACK_LABEL_W && y > HEADER_HEIGHT) {
            const ti = Math.floor((y - HEADER_HEIGHT) / (TRACK_HEIGHT + TRACK_GAP));
            const sorted = sortTracks(timeline.tracks);
            const track = sorted[ti];
            if (!track) return;
            const ly = y - HEADER_HEIGHT - ti * (TRACK_HEIGHT + TRACK_GAP);
            if (ly > TRACK_HEIGHT - 16) {
              pushState(timeline);
              const tracks = timeline.tracks.map((t) => {
                if (t.trackId !== track.trackId) return t;
                if (x < 20) return { ...t, muted: !t.muted };
                if (x < 40) return { ...t, solo: !t.solo };
                return t;
              });
              store.set(TimelineState, { ...timeline, tracks });
            }
            return;
          }
          // Timeline area: set playhead
          if (x >= TRACK_LABEL_W) {
            const time = snapToFrame(pxToTime(x - TRACK_LABEL_W + timeline.scrollX, timeline.zoom), timeline.fps);
            pushState(timeline);
            store.set(TimelineState, { ...timeline, playheadPosition: time });
          }
        }}"
        onwheel="${(host, e) => {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            // Zoom
            const delta = e.deltaY > 0 ? 0.8 : 1.25;
            const newZoom = Math.max(0.1, Math.min(10, timeline.zoom * delta));
            store.set(TimelineState, { ...timeline, zoom: newZoom });
          } else {
            // Scroll
            const newScroll = Math.max(0, timeline.scrollX + e.deltaX + e.deltaY);
            store.set(TimelineState, { ...timeline, scrollX: newScroll });
          }
        }}"
      >
        <canvas></canvas>
      </div>
    `,
    shadow: false,
    connect(host) {
      requestAnimationFrame(() => {
        const canvas = host.querySelector('canvas');
        if (!canvas) return;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        host._ctx = canvas.getContext('2d');
        // Initial draw
        const s = store.get(TimelineState);
        if (s) draw(host._ctx, s, canvas.width, canvas.height, () => {});
        // Resize handler
        const obs = new ResizeObserver(() => {
          const r = canvas.parentElement.getBoundingClientRect();
          canvas.width = r.width;
          canvas.height = r.height;
          const st = store.get(TimelineState);
          if (st && host._ctx) draw(host._ctx, st, canvas.width, canvas.height, () => {});
        });
        obs.observe(canvas.parentElement);
        host._resizeObs = obs;
      });
    },
    disconnect(host) {
      host._resizeObs?.disconnect();
      host._ctx = null;
    },
  },
});
