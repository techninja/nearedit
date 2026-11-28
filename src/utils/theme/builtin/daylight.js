/**
 * Daylight — the light theme the editor opens in when the system is light:
 * white panels on warm-neutral greys, and a darker timeline well so clips
 * keep their weight.
 * @module utils/theme/builtin/daylight
 */

/** @type {import('#utils/theme/model.js').Theme} */
export default {
  id: 'daylight',
  name: 'Daylight',
  description: 'Warm-neutral light: white panels, a darker timeline well',
  scheme: 'light',
  extends: '',
  roles: {
    bg: '#f4f3f1',
    surface: '#ffffff',
    surface2: '#efedea',
    surface3: '#e3e0dc',
    border: '#d3cfca',
    text: '#1c1b19',
    muted: '#66615b',
    accent: '#2563eb',
    onAccent: '#ffffff',
    focus: '#2563eb',
    timeline: '#dedbd6',
    ruler: '#efedea',
    lane: '#e9e6e2',
    laneAlt: '#e3e0db',
    grid: '#cfcbc5',
    playhead: '#e23c3c',
    selection: '#92400e',
    clipText: '#111111',
  },
};
