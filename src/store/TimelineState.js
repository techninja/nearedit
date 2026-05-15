/**
 * Timeline EDL state — the central JSON AST for the video editor.
 * @module store/TimelineState
 */

import { store } from 'hybrids';

/** @type {import('hybrids').Model<object>} */
const TimelineState = {
  fps: 30,
  resolution: '1920x1080',
  playheadPosition: 0,
  cursorPosition: 0, // remembered position for stop-return behavior
  zoom: 1,
  scrollX: 0,
  playing: false,
  tracks: [{
    trackId: '',
    type: 'video',
    name: '',
    muted: false,
    solo: false,
    clips: [{
      clipId: '',
      sourceFile: '',       // empty = placeholder/unfulfilled
      sourceIn: 0,
      sourceOut: 0,
      timelineStart: 0,
      timelineEnd: 0,
      fadeIn: 0,
      fadeOut: 0,
      linkedClipId: '',
      // Placeholder/intent fields
      placeholder: false,   // true = no media yet, just an idea
      label: '',            // user-facing name/description
      prompt: '',           // generation prompt or search query
      intent: '',           // narration, broll, sfx, music, title, transition
      color: '',            // visual color on timeline when placeholder
      transform: {
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
        kenBurns: {
          startX: 0,
          startY: 0,
          startScale: 1,
          endX: 0,
          endY: 0,
          endScale: 1,
          startCropTop: 0,
          startCropBottom: 0,
          startCropLeft: 0,
          startCropRight: 0,
          endCropTop: 0,
          endCropBottom: 0,
          endCropLeft: 0,
          endCropRight: 0,
        },
      },
    }],
  }],
  [store.connect]: {
    get: () => {
      const raw = localStorage.getItem('nearedit_timeline');
      if (raw) return JSON.parse(raw);
      // Default: one video track + one audio track
      return {
        tracks: [
          { trackId: 'v1', type: 'video', name: 'Video 1', muted: false, solo: false, clips: [] },
          { trackId: 'a1', type: 'audio', name: 'Audio 1', muted: false, solo: false, clips: [] },
        ],
      };
    },
    set: (id, values) => {
      localStorage.setItem('nearedit_timeline', JSON.stringify(values));
      return values;
    },
  },
};

export default TimelineState;
