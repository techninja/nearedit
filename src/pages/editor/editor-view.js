/**
 * Editor page — main editing workspace.
 * Loads EDL from project file, auto-saves on changes.
 * @module pages/editor
 */

import { html, define, store, router } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import AppState from '#store/AppState.js';
import { undo, redo } from '#utils/undoHistory.js';
import { initKeyboard, destroyKeyboard } from '#utils/keyboard.js';
import { destroyAudio } from '#utils/audioEngine.js';
import { connectWS, disconnectWS } from '#utils/wsClient.js';
import '#organisms/timeline-canvas/index.js';
import '#organisms/media-bin/index.js';
import '#organisms/video-preview/index.js';
import '#organisms/director-panel/index.js';
import '#atoms/transport-controls/index.js';

/** Module-level project cache (not on the routed view to avoid router serialization) */
let _projectCache = null;

/** Debounced save to server */
let saveTimer = 0;
function debouncedSave(projectId, adaptationId, edl) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch(`/api/projects/${projectId}/edl/${adaptationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edl),
    }).catch(() => {});
  }, 1000);
}

export default define({
  tag: 'editor-view',
  [router.connect]: { url: '/editor/:projectId/:adaptationId' },
  projectId: '',
  adaptationId: '',
  timeline: {
    ...store(TimelineState),
    observe(host, val) {
      if (val && host.projectId && host.adaptationId && !val.playing) {
        debouncedSave(host.projectId, host.adaptationId, val);
      }
    },
  },
  appState: {
    ...store(AppState),
    observe(host, val) {
      if (!val) return;
      document.documentElement.setAttribute('data-theme', val.theme);
    },
  },
  _init: { value: false, connect(host) {
    initKeyboard();
    connectWS();
    const state = store.get(AppState);
    if (state) {
      document.documentElement.setAttribute('data-theme', state.theme);
      // Apply persisted panel height after DOM is ready
      if (state.panelHeight > 0) {
        requestAnimationFrame(() => {
          const panels = host.querySelector('.editor-panels');
          if (panels) {
            panels.style.height = state.panelHeight + 'px';
            panels.style.flex = 'none';
          }
        });
      }
    }
    // Load project info and EDL
    if (host.projectId && host.adaptationId) {
      fetch(`/api/projects/${host.projectId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((proj) => {
          _projectCache = proj;
          const adaptation = proj?.adaptations?.find((a) => a.id === host.adaptationId);
          fetch(`/api/projects/${host.projectId}/edl/${host.adaptationId}`)
            .then((r) => r.ok ? r.json() : null)
            .then((edl) => {
              if (edl) {
                // Ensure minimum track structure
                const tracks = edl.tracks || [];
                if (!tracks.find((t) => t.type === 'video')) {
                  tracks.unshift({ trackId: 'v1', type: 'video', name: 'Video 1', muted: false, solo: false, clips: [] });
                }
                if (!tracks.find((t) => t.type === 'audio')) {
                  tracks.push({ trackId: 'a1', type: 'audio', name: 'Audio 1', muted: false, solo: false, clips: [] });
                }
                // Sanitize clips with invalid paths
                for (const track of tracks) {
                  if (!track.clips) continue;
                  track.clips = track.clips.filter((clip) => {
                    if (!clip.sourceFile) return !!clip.placeholder;
                    if (clip.sourceFile.includes('/undefined')) return false;
                    // Valid absolute paths have at least 2 path segments
                    if (clip.sourceFile.split('/').filter(Boolean).length < 2) return false;
                    return true;
                  });
                }
                store.set(TimelineState, {
                  ...edl,
                  tracks,
                  resolution: adaptation?.resolution || edl.resolution || '1920x1080',
                  fps: adaptation?.fps || edl.fps || 30,
                  playing: false,
                });
              }
            });
        });
    }
    return () => { destroyKeyboard(); destroyAudio(); disconnectWS(); clearTimeout(saveTimer); _projectCache = null; };
  }},
  render: {
    value: ({ timeline, appState, projectId }) => {
      const adaptation = _projectCache?.adaptations?.find((a) => a.id === document.querySelector('editor-view')?.adaptationId);
      return html`
      <div class="editor-view">
        <header class="editor-header">
          <a href="${projectId ? `/project/${projectId}` : '/'}" class="btn btn-ghost"><app-icon name="chevron" size="sm"></app-icon></a>
          <div class="editor-title">
            <a href="/project/${projectId}" class="editor-project-name">${_projectCache?.name || 'NearEdit'}</a>
            ${adaptation ? html`<span class="editor-adaptation-name">${adaptation.name} <span class="badge badge-info">${adaptation.aspectRatio}</span></span>` : html``}
          </div>
          <transport-controls></transport-controls>
          <div class="editor-actions">
            <button class="btn btn-ghost" title="Toggle theme" onclick="${() => {
              const next = appState.theme === 'dark' ? 'light' : 'dark';
              store.set(AppState, { ...appState, theme: next });
            }}"><app-icon name="${appState.theme === 'dark' ? 'monitor' : 'monitor'}" size="sm"></app-icon></button>
            <button class="btn btn-secondary" onclick="${() => {
              const prev = undo(timeline);
              if (prev) store.set(TimelineState, prev);
            }}"><app-icon name="undo" size="sm"></app-icon></button>
            <button class="btn btn-secondary" onclick="${() => {
              const next = redo(timeline);
              if (next) store.set(TimelineState, next);
            }}"><app-icon name="redo" size="sm"></app-icon></button>
            <button class="btn btn-primary" onclick="${() => {
              const edl = { project: { fps: timeline.fps, resolution: timeline.resolution }, tracks: timeline.tracks };
              fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edl) })
                .then((r) => r.json()).then((d) => alert(d.output || d.error));
            }}"><app-icon name="export" size="sm"></app-icon> Export</button>
          </div>
        </header>
        <div class="editor-panels">
          <aside class="editor-sidebar">
            <media-bin></media-bin>
          </aside>
          <div class="editor-preview-area">
            <director-panel></director-panel>
            <video-preview></video-preview>
          </div>
        </div>
        <div class="editor-resize-handle" onmousedown="${(host, e) => {
          e.preventDefault();
          const panels = host.querySelector('.editor-panels');
          const startY = e.clientY;
          const startHeight = panels.getBoundingClientRect().height;
          const onMove = (ev) => {
            const delta = ev.clientY - startY;
            const newHeight = Math.max(100, startHeight + delta);
            panels.style.height = newHeight + 'px';
            panels.style.flex = 'none';
          };
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            // Persist panel height
            const h = panels.getBoundingClientRect().height;
            store.set(AppState, { ...host.appState, panelHeight: Math.round(h) });
            window.dispatchEvent(new Event('resize'));
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}"></div>
        <div class="editor-timeline">
          <timeline-canvas></timeline-canvas>
        </div>
      </div>
    `;
    },
    shadow: false,
  },
});
