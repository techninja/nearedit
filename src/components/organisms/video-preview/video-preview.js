/**
 * Video preview — composited output using dual-mode compositor.
 * Playback: videos play natively, frames grabbed each rAF.
 * Scrub: videos seeked to exact time on playhead change.
 * @module components/organisms/video-preview
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { Compositor } from '#utils/compositor.js';
import { totalDuration } from '#utils/timelineMath.js';

/** @type {Compositor|null} */
let compositor = null;

/** @type {number} last observed playhead for dedup */
let lastScrubTime = -1;

export default define({
  tag: 'video-preview',
  timeline: {
    ...store(TimelineState),
    observe(host, val) {
      if (!val || !compositor) return;

      if (val.playing) {
        // If compositor isn't already in playback mode, start it
        if (!compositor.isPlaying) {
          const dur = totalDuration(val.tracks || []);
          compositor.startPlayback(val.tracks, val.playheadPosition, (time) => {
            // Update store playhead from compositor tick
            // (handled by keyboard.js — compositor just renders)
            if (time >= dur) {
              compositor.stopPlayback();
            }
          });
        }
      } else {
        // Stopped — scrub mode
        if (compositor.isPlaying) {
          compositor.stopPlayback();
        }
        // Only scrub if playhead actually moved
        if (Math.abs(val.playheadPosition - lastScrubTime) > 0.01) {
          lastScrubTime = val.playheadPosition;
          compositor.scrub(val.tracks || [], val.playheadPosition);
        }
      }
    },
  },
  render: {
    value: () => html`
      <div class="video-preview">
        <canvas></canvas>
      </div>
    `,
    shadow: false,
    connect(host) {
      requestAnimationFrame(() => {
        const canvas = host.querySelector('canvas');
        if (!canvas) return;
        const rect = canvas.parentElement.getBoundingClientRect();
        const w = Math.floor(rect.width) || 640;
        const h = Math.floor(w * 9 / 16);
        canvas.width = w;
        canvas.height = h;
        compositor = new Compositor(w, h);
        compositor.setOutput(canvas);

        // Initial scrub
        const s = store.get(TimelineState);
        if (s) compositor.scrub(s.tracks || [], s.playheadPosition || 0);

        // Handle resize
        const obs = new ResizeObserver(() => {
          const r = canvas.parentElement.getBoundingClientRect();
          const nw = Math.floor(r.width) || 640;
          const nh = Math.floor(nw * 9 / 16);
          canvas.width = nw;
          canvas.height = nh;
          compositor.resize(nw, nh);
          const st = store.get(TimelineState);
          if (st && !compositor.isPlaying) compositor.scrub(st.tracks || [], st.playheadPosition || 0);
        });
        obs.observe(canvas.parentElement);
        host._resizeObs = obs;
      });
    },
    disconnect(host) {
      host._resizeObs?.disconnect();
      if (compositor) { compositor.destroy(); compositor = null; }
      lastScrubTime = -1;
    },
  },
});
