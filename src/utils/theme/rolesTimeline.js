/**
 * The roles of the timeline — its own grounds and lines — and of the
 * clips on it: one colour a kind, and the ink of their labels. Part of
 * `ROLES` (`roles.js`). Isomorphic and pure.
 * @module utils/theme/rolesTimeline
 */

import { inkFor, mix } from './color.js';

/** @typedef {import('./roles.js').Role} Role */

const BLACK = '#000000';

/** @type {(id: string, name: string, token: string, label: string) => Pick<Role, 'id'|'path'|'token'|'label'>} */
const head = (id, name, token, label) => ({ id, path: `timeline.${name}`, token, label });

/** @type {Role[]} */
export const TIMELINE_ROLES = [
  {
    ...head('timeline', 'ground', '--color-timeline-bg', 'Timeline well'),
    description: 'Behind and below the tracks',
    rule: 'The ground, a quarter towards black in a dark theme, a little towards the text in a light one',
    from: (get, scheme) =>
      scheme === 'dark' ? mix(get('bg'), BLACK, 0.25) : mix(get('bg'), get('text'), 0.08),
  },
  {
    ...head('ruler', 'ruler', '--color-timeline-ruler', 'Ruler'),
    description: 'The time ruler, the corner beside it, the scroll bar',
    rule: 'The quiet fill',
    from: (get) => get('surface2'),
  },
  {
    ...head('lane', 'lane', '--color-timeline-lane', 'Track'),
    description: 'The ground of a track',
    rule: 'The ground, a touch darker',
    from: (get, scheme) =>
      scheme === 'dark' ? mix(get('bg'), BLACK, 0.04) : mix(get('bg'), get('text'), 0.04),
  },
  {
    ...head('laneAlt', 'laneAlt', '--color-timeline-lane-alt', 'Every other track'),
    description: 'The ground of every second track, so rows can be told apart',
    rule: 'The ground, a little darker than a track',
    from: (get, scheme) =>
      scheme === 'dark' ? mix(get('bg'), BLACK, 0.14) : mix(get('bg'), get('text'), 0.07),
  },
  {
    ...head('grid', 'grid', '--color-timeline-grid', 'Grid'),
    description: 'Time lines through the tracks, the lines between track headers',
    rule: 'The strong fill in a dark theme, the lines in a light one',
    from: (get, scheme) => (scheme === 'dark' ? get('surface3') : get('border')),
  },
  {
    ...head('playhead', 'playhead', '--color-playhead', 'Playhead'),
    description: 'Where playback is',
    rule: 'The red of the logo',
    from: () => '#ef4444',
  },
  {
    ...head('cursor', 'cursor', '--color-cursor', 'Edit cursor'),
    description: 'Where the next edit lands',
    rule: 'The text colour',
    from: (get) => get('text'),
  },
  {
    ...head('selection', 'selection', '--color-selection', 'Selection'),
    description: 'The outline of chosen clips, marked words and ranges',
    rule: 'Amber',
    from: () => '#f59e0b',
  },
  {
    ...head('snap', 'snap', '--color-snap', 'Snap'),
    description: 'The line an edit snaps to; the word being said',
    rule: 'Cyan',
    from: () => '#06b6d4',
  },
  {
    ...head('marker', 'marker', '--color-marker', 'Marker'),
    description: 'Markers and their flags, keyframes',
    rule: 'Orange',
    from: () => '#f97316',
  },
];

/**
 * A colour for each kind of clip, in the logo's colours: blue video, green
 * audio, amber pictures. `[name, colour, label, what it is]`.
 */
const KINDS = [
  ['video', '#3b82f6', 'Video', 'Video clips'],
  ['audio', '#10b981', 'Audio', 'Sound: the audio of a video, a recording, a tone'],
  ['image', '#f59e0b', 'Picture', 'Still pictures'],
  ['title', '#a855f7', 'Text', 'Titles and other text'],
  ['generator', '#ec4899', 'Generator', 'Gradients, shapes, particles: pictures the editor makes'],
  ['web', '#0891b2', 'Web', 'Recordings of a web page'],
  ['music', '#818cf8', 'Music', 'Music written in the editor; the notes of its piano roll'],
  ['element', '#9aa987', 'Brand element', 'Lower thirds, intros, the logo bug'],
  ['placeholder', '#8a8a8a', 'Placeholder', 'A clip that is still to be filled'],
];

/** The ids of the roles that colour a clip. */
export const CLIP_ROLE_IDS = KINDS.map(([name]) => `clip${name[0].toUpperCase()}${name.slice(1)}`);

/** @type {Role[]} */
export const CLIP_ROLES = [
  ...KINDS.map(([name, colour, label, description], i) => ({
    ...{ id: CLIP_ROLE_IDS[i], path: `clip.${name}`, token: `--color-clip-${name}`, label },
    description,
    rule: `The editor's own colour for it (${colour})`,
    from: () => colour,
  })),
  {
    ...{ id: 'clipText', path: 'clip.text', token: '--color-clip-text', label: 'Clip labels' },
    description: 'Names, waveforms and marks drawn on a clip, the letters of a marker flag',
    rule: 'Near-black or white, whichever reads on every clip colour and on the marker',
    from: (get) => inkFor([...CLIP_ROLE_IDS, 'marker'].map(get), ['#ffffff', '#111111']),
  },
];
