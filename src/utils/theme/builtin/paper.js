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
    muted: '#64748b',
    accent: '#2563eb',
    onAccent: '#ffffff',
    focus: '#2563eb',
    danger: '#dc2626',
    warning: '#d97706',
    success: '#16a34a',
    info: '#0284c7',
    timeline: '#e9eef5',
    ruler: '#dbe3ee',
    lane: '#f4f7fb',
    laneAlt: '#edf1f7',
    grid: '#cbd5e1',
    cursor: '#0f172a',
    clipVideo: '#3b82f6',
    clipAudio: '#10b981',
    clipImage: '#f59e0b',
    clipTitle: '#a855f7',
    clipGenerator: '#db2777',
    clipWeb: '#0891b2',
    clipMusic: '#4f46e5',
    clipElement: '#65a30d',
    clipPlaceholder: '#64748b',
    clipText: '#ffffff',
  },
};
