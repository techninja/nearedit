/**
 * Paper — the editor's first light look, kept: cool white and slate with
 * white labels on deep clips.
 * @module utils/theme/builtin/paper
 */

/** @type {import('#utils/theme/model.js').Theme} */
export default {
  id: 'paper',
  name: 'Paper',
  description: 'Cool white and slate, the first light look of the editor',
  scheme: 'light',
  extends: '',
  roles: {
    bg: '#f8fafc',
    surface: '#ffffff',
    surface2: '#f1f5f9',
    surface3: '#e2e8f0',
    border: '#e2e8f0',
    text: '#1e293b',
    muted: '#55637b',
    accent: '#2563eb',
    onAccent: '#ffffff',
    focus: '#2563eb',
    danger: '#dc2626',
    warning: '#b45309',
    success: '#15803d',
    info: '#0369a1',
    timeline: '#e9eef5',
    ruler: '#dbe3ee',
    lane: '#f4f7fb',
    laneAlt: '#edf1f7',
    grid: '#cbd5e1',
    playhead: '#dc2626',
    cursor: '#0f172a',
    selection: '#92400e',
    clipVideo: '#3b82f6',
    clipAudio: '#10b981',
    clipImage: '#f59e0b',
    clipTitle: '#ac5cf7',
    clipGenerator: '#ec4899',
    clipWeb: '#0891b2',
    clipMusic: '#818cf8',
    clipElement: '#6fa8a0',
    clipPlaceholder: '#94a3b8',
    clipText: '#0f172a',
  },
};
