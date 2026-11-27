/**
 * Timeline EDL document — the central JSON AST for one adaptation.
 *
 * This model holds the *document* only (tracks, clips, markers, format).
 * Transient editor state (playhead, zoom, selection) lives in ViewState.
 * Field semantics and invariants: docs/app-spec/EDL.md.
 *
 * Hybrids drops any property not declared here, so every EDL field must be
 * declared in this shape before it can be stored.
 *
 * @module store/TimelineState
 */

import { store } from 'hybrids';
import { DEFAULT_TRACKS } from '#utils/edl/factory.js';

/** @type {import('hybrids').Model<any>} */
const TimelineState = {
  version: 2,
  fps: 30,
  resolution: '1920x1080',
  tracks: [
    {
      trackId: '',
      type: 'video', // 'video' | 'audio'
      name: '',
      muted: false,
      solo: false,
      locked: false,
      volume: 1, // audio tracks: linear gain 0..2
      clips: [
        {
          clipId: '',
          sourceFile: '', // absolute path; empty for titles and placeholders
          sourceIn: 0,
          sourceOut: 0,
          timelineStart: 0,
          timelineEnd: 0,
          fadeIn: 0,
          fadeOut: 0,
          volume: 1, // clip gain 0..2 (audio tracks)
          linkedClipId: '', // A/V partner that moves, trims and deletes together
          groupId: '', // clips sharing a groupId move together
          placeholder: false, // true = intention without media yet
          label: '',
          prompt: '',
          intent: '', // narration | broll | sfx | music | title | transition
          color: '',
          text: {
            content: '', // non-empty on a clip without sourceFile = title clip
            fontFamily: 'sans-serif', // sans-serif | serif | monospace
            fontSize: 72, // px at output resolution
            color: '#ffffff',
            background: '', // box colour, empty = none
            align: 'center', // left | center | right
            bold: true,
            italic: false,
            outlineColor: '#000000',
            outlineWidth: 0,
          },
          transform: {
            fit: 'cover', // cover | contain
            x: 0, // px at output resolution, offset from centred
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0, // degrees clockwise
            opacity: 1,
            cropTop: 0, // fractions of the source, 0..1
            cropBottom: 0,
            cropLeft: 0,
            cropRight: 0,
            anchorX: 0.5,
            anchorY: 0.5,
            kenBurns: {
              enabled: false, // when true start/end replace x, y, scale, crop
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
        },
      ],
    },
  ],
  markers: [{ markerId: '', time: 0, label: '', color: '' }],
  [store.connect]: {
    // An explicit getter is required: without one hybrids seeds nested lists
    // with a single blank template item instead of real defaults.
    get: () => ({ tracks: DEFAULT_TRACKS(), markers: [] }),
    set: (_id, values) => values,
  },
};

export default TimelineState;
