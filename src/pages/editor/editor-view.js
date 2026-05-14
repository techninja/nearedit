/**
 * Editor page — main editing workspace.
 * Loads EDL from project file, auto-saves on changes.
 * @module pages/editor
 */

import { html, define, store, router } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { undo, redo } from '#utils/undoHistory.js';
import { initKeyboard, destroyKeyboard } from '#utils/keyboard.js';
import '#organisms/timeline-canvas/index.js';
import '#organisms/media-bin/index.js';
import '#organisms/video-preview/index.js';
import '#atoms/transport-controls/index.js';

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
      // Auto-save EDL back to project file (debounced, skip during playback)
      if (val && host.projectId && host.adaptationId && !val.playing) {
        debouncedSave(host.projectId, host.adaptationId, val);
      }
    },
  },
  _init: { value: false, connect(host) {
    initKeyboard();
    // Load EDL from project file
    if (host.projectId && host.adaptationId) {
      fetch(`/api/projects/${host.projectId}/edl/${host.adaptationId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((edl) => {
          if (edl) store.set(TimelineState, { ...edl, playing: false });
        });
    }
    return () => { destroyKeyboard(); clearTimeout(saveTimer); };
  }},
  render: {
    value: ({ timeline, projectId }) => html`
      <div class="editor-view">
        <header class="editor-header">
          <a href="${projectId ? `/project/${projectId}` : '/'}" class="btn btn-ghost"><app-icon name="chevron" size="sm"></app-icon></a>
          <h1>NearEdit</h1>
          <transport-controls></transport-controls>
          <div class="editor-actions">
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
            <video-preview></video-preview>
          </div>
        </div>
        <div class="editor-timeline">
          <timeline-canvas></timeline-canvas>
        </div>
      </div>
    `,
    shadow: false,
  },
});
