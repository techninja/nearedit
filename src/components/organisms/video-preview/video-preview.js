/**
 * Video preview — composited output using dual-mode compositor.
 * Canvas aspect ratio matches the adaptation's resolution.
 * @module components/organisms/video-preview
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { Compositor } from '#utils/compositor.js';
import { totalDuration } from '#utils/timelineMath.js';

/** @type {Compositor|null} */
let compositor = null;
let lastScrubTime = -1;

/**
 * Parse resolution string into width/height.
 * @param {string} res - e.g. "1920x1080" or "1080x1920"
 * @returns {{ w: number, h: number }}
 */
function parseResolution(res) {
  const [w, h] = (res || '1920x1080').split('x').map(Number);
  return { w: w || 1920, h: h || 1080 };
}

export default define({
  tag: 'video-preview',
  timeline: {
    ...store(TimelineState),
    observe(host, val) {
      if (!val || !compositor) return;

      if (val.playing) {
        if (!compositor.isPlaying) {
          const dur = totalDuration(val.tracks || []);
          compositor.startPlayback(val.tracks, val.playheadPosition, (time) => {
            if (time >= dur) compositor.stopPlayback();
          });
        }
      } else {
        if (compositor.isPlaying) compositor.stopPlayback();
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

        const s = store.get(TimelineState);
        const { w: outW, h: outH } = parseResolution(s?.resolution);
        const outputAspect = outW / outH;
        const rect = canvas.parentElement.getBoundingClientRect();

        // Size canvas pixels to fit container at the output aspect ratio
        let cw, ch;
        if (outputAspect > rect.width / rect.height) {
          cw = Math.floor(rect.width);
          ch = Math.floor(rect.width / outputAspect);
        } else {
          ch = Math.floor(rect.height);
          cw = Math.floor(rect.height * outputAspect);
        }
        canvas.width = cw;
        canvas.height = ch;

        compositor = new Compositor(cw, ch, outputAspect);
        compositor.setOutput(canvas);

        if (s) compositor.scrub(s.tracks || [], s.playheadPosition || 0);

        const obs = new ResizeObserver(() => {
          const r = canvas.parentElement.getBoundingClientRect();
          const st = store.get(TimelineState);
          const { w: ow, h: oh } = parseResolution(st?.resolution);
          const aspect = ow / oh;
          let nw, nh;
          if (aspect > r.width / r.height) {
            nw = Math.floor(r.width);
            nh = Math.floor(r.width / aspect);
          } else {
            nh = Math.floor(r.height);
            nw = Math.floor(r.height * aspect);
          }
          if (nw < 1 || nh < 1) return;
          canvas.width = nw;
          canvas.height = nh;
          if (compositor) {
            compositor.resize(nw, nh, aspect);
            if (st && !compositor.isPlaying) compositor.scrub(st.tracks || [], st.playheadPosition || 0);
          }
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
