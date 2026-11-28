/**
 * Studio — the dark theme the editor opens in when the system is dark.
 * Its greys carry no hue, so what surrounds the picture does not tint how
 * the picture is judged; clips are in the logo's colours with dark labels.
 * @module utils/theme/builtin/studio
 */

/** @type {import('#utils/theme/model.js').Theme} */
export default {
  id: 'studio',
  name: 'Studio',
  description: 'Neutral dark grey: no colour around the picture',
  scheme: 'dark',
  extends: '',
  roles: {
    bg: '#161616',
    surface: '#212121',
    surface2: '#1b1b1b',
    surface3: '#2d2d2d',
    border: '#3a3a3a',
    text: '#e8e8e8',
    muted: '#9c9c9c',
    accent: '#4a8df8',
    onAccent: '#0b0b0b',
    focus: '#7ab2ff',
    timeline: '#101010',
    ruler: '#1b1b1b',
    lane: '#171717',
    laneAlt: '#141414',
    grid: '#2b2b2b',
    clipText: '#111111',
  },
};
