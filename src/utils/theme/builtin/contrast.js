/**
 * High contrast — black, white and strong edges, for low vision and bright
 * rooms; what the editor opens in when the system asks for more contrast.
 * @module utils/theme/builtin/contrast
 */

/** @type {import('#utils/theme/model.js').Theme} */
export default {
  id: 'contrast',
  name: 'High contrast',
  description: 'Black, white and strong edges, for low vision and bright rooms',
  scheme: 'dark',
  extends: '',
  roles: {
    bg: '#000000',
    surface: '#0c0c0c',
    surface2: '#060606',
    surface3: '#262626',
    border: '#8c8c8c',
    text: '#ffffff',
    muted: '#d6d6d6',
    accent: '#6cb4ff',
    onAccent: '#000000',
    focus: '#ffd60a',
    danger: '#ff8080',
    warning: '#ffd60a',
    success: '#5fe08a',
    info: '#7fd4ff',
    timeline: '#000000',
    ruler: '#0c0c0c',
    lane: '#050505',
    laneAlt: '#101010',
    grid: '#5a5a5a',
    playhead: '#ff5a5a',
    clipVideo: '#60a5fa',
    clipAudio: '#34d399',
    clipImage: '#fbbf24',
    clipTitle: '#c084fc',
    clipGenerator: '#f472b6',
    clipWeb: '#22d3ee',
    clipMusic: '#a5b4fc',
    clipElement: '#9fd6cd',
    clipPlaceholder: '#b3b3b3',
    clipText: '#000000',
  },
};
