/**
 * Transport controls — play, pause, skip, time display.
 * Delegates to the keyboard action system for consistent behavior.
 * @module components/atoms/transport-controls
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { totalDuration } from '#utils/timelineMath.js';
import '#atoms/app-icon/index.js';

/** Format seconds as MM:SS.ff */
function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${String(m).padStart(2, '0')}:${sec}`;
}

export default define({
  tag: 'transport-controls',
  timeline: store(TimelineState),
  render: {
    value: ({ timeline }) => {
      const dur = totalDuration(timeline.tracks || []);
      return html`
        <div class="transport-controls">
          <button class="btn btn-ghost" title="Go to start (Home)" onclick="${() => {
            store.set(TimelineState, { ...timeline, playheadPosition: 0, cursorPosition: 0 });
          }}"><app-icon name="skip-back" size="sm"></app-icon></button>
          <button class="btn btn-primary" title="Play/Pause (Space)" onclick="${() => {
            // Simulate SPACE behavior: play/pause with return
            document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
          }}"><app-icon name="${timeline.playing ? 'pause' : 'play'}" size="sm"></app-icon></button>
          <button class="btn btn-ghost" title="Go to end (End)" onclick="${() => {
            store.set(TimelineState, { ...timeline, playheadPosition: dur, cursorPosition: dur });
          }}"><app-icon name="skip-forward" size="sm"></app-icon></button>
          <span class="transport-time">${fmt(timeline.playheadPosition || 0)} / ${fmt(dur)}</span>
          <button class="btn btn-ghost" title="Split at playhead (S)"><app-icon name="split" size="sm"></app-icon></button>
        </div>
      `;
    },
    shadow: false,
  },
});
