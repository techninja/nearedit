/**
 * Timeline canvas — thin component shell.
 * Drawing: timelineDraw.js. Interactions: clipInteractions.js.
 * @module components/organisms/timeline-canvas
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { pxToTime, snapToFrame } from '#utils/timelineMath.js';
import { pushState } from '#utils/undoHistory.js';
import {
  draw,
  sortTracks,
  setDrawContext,
  TRACK_HEIGHT,
  TRACK_GAP,
  HEADER_HEIGHT,
  TRACK_LABEL_W,
} from '#utils/timelineDraw.js';
import { hitTest, setSelection, moveClip, trimClip, slipClip } from '#utils/clipInteractions.js';

export default define({
  tag: 'timeline-canvas',
  timeline: {
    ...store(TimelineState),
    observe(host, val) {
      if (!host._ctx || !val) return;
      const canvas = host.querySelector('canvas');
      if (!canvas) return;
      draw(host._ctx, val, canvas.width, canvas.height, () => {
        const s = store.get(TimelineState);
        if (s && host._ctx) draw(host._ctx, s, canvas.width, canvas.height, () => {});
      });
    },
  },
  _ctx: { value: null, connect: () => {} },
  render: {
    value: ({ timeline }) => html`
      <div
        class="timeline-canvas-wrap"
        onmousemove="${(host, e) => {
          const canvas = host.querySelector('canvas');
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          if (x < TRACK_LABEL_W) {
            canvas.style.cursor = 'default';
            return;
          }
          const hit = hitTest(x, y, timeline);
          if (!hit) {
            canvas.style.cursor = 'crosshair';
          } else if (hit.edge === 'left' || hit.edge === 'right') {
            canvas.style.cursor = 'col-resize';
          } else if (e.altKey) {
            canvas.style.cursor = 'ew-resize';
          } else {
            canvas.style.cursor = 'grab';
          }
        }}"
        onmousedown="${(host, e) => {
          const canvas = host.querySelector('canvas');
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          // Track label: mute/solo
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

          if (x < TRACK_LABEL_W) return;

          // Hit test clips
          const hit = hitTest(x, y, timeline);
          if (hit) {
            setSelection({ trackId: hit.track.trackId, clipId: hit.clip.clipId });
            pushState(timeline);
            const startX = e.clientX;
            const startTime = hit.clip.timelineStart;

            const onMove = (ev) => {
              canvas.style.cursor = hit.edge === 'body' ? 'grabbing' : 'col-resize';
              const dx = ev.clientX - startX;
              const dt = pxToTime(dx, timeline.zoom);
              let newState;
              if (hit.edge === 'body' && ev.altKey) {
                // Slip edit: shift source window, keep timeline position
                newState = slipClip(timeline, hit.clip.clipId, dt);
              } else if (hit.edge === 'body') {
                newState = moveClip(timeline, hit.track.trackId, hit.clip.clipId, dt);
              } else {
                newState = trimClip(timeline, hit.clip.clipId, hit.edge, dt);
              }
              store.set(TimelineState, newState);
            };
            const onUp = () => {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            // Force redraw for selection highlight
            store.set(TimelineState, { ...timeline });
            return;
          }

          // No clip hit — set playhead, clear selection
          setSelection(null);
          const time = snapToFrame(
            pxToTime(x - TRACK_LABEL_W + timeline.scrollX, timeline.zoom),
            timeline.fps,
          );
          store.set(TimelineState, { ...timeline, playheadPosition: time });
        }}"
        onwheel="${(host, e) => {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            const delta = e.deltaY > 0 ? 0.8 : 1.25;
            store.set(TimelineState, {
              ...timeline,
              zoom: Math.max(0.1, Math.min(10, timeline.zoom * delta)),
            });
          } else {
            store.set(TimelineState, {
              ...timeline,
              scrollX: Math.max(0, timeline.scrollX + e.deltaX + e.deltaY),
            });
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
        setDrawContext(host._ctx, canvas.width, canvas.height);
        const s = store.get(TimelineState);
        if (s) draw(host._ctx, s, canvas.width, canvas.height, () => {});
        const obs = new ResizeObserver(() => {
          const r = canvas.parentElement.getBoundingClientRect();
          canvas.width = r.width;
          canvas.height = r.height;
          setDrawContext(host._ctx, canvas.width, canvas.height);
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
