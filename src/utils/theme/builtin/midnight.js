/**
 * Midnight — the editor's first dark look, kept: slate navy with a blue
 * accent and white labels on deep clips.
 * @module utils/theme/builtin/midnight
 */

/** @type {import('#utils/theme/model.js').Theme} */
export default {
  id: 'midnight',
  name: 'Midnight',
  description: 'Slate navy, the first dark look of the editor',
  scheme: 'dark',
  extends: '',
  roles: {
    bg: '#0f172a',
    surface: '#1e293b',
    surface2: '#172033',
    surface3: '#263349',
    border: '#334155',
    text: '#e2e8f0',
    muted: '#94a3b8',
    accent: '#3b82f6',
    onAccent: '#0f172a',
    focus: '#60a5fa',
    danger: '#ef4444',
    warning: '#f59e0b',
    success: '#22c55e',
    info: '#38bdf8',
    timeline: '#0b1220',
    ruler: '#172033',
    lane: '#111a2c',
    laneAlt: '#0e1626',
    grid: '#263349',
    clipVideo: '#2f6fdb',
    clipAudio: '#0e9f75',
    clipImage: '#d98a0b',
    clipTitle: '#9333ea',
    clipGenerator: '#be185d',
    clipWeb: '#0b7b98',
    clipMusic: '#4338ca',
    clipElement: '#4d7c0f',
    clipPlaceholder: '#56657d',
    clipText: '#ffffff',
  },
};
