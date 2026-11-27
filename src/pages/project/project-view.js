/**
 * Project view — shows source folders, content stats, adaptation management.
 * @module pages/project
 */

import { html, define, router } from 'hybrids';
import EditorView from '#pages/editor/editor-view.js';
import { pickFolder } from '#utils/folderPicker.js';
import '#atoms/app-icon/index.js';

const PRESETS = [
  { name: 'YouTube 4K HDR', aspectRatio: '16:9', resolution: '3840x2160', fps: 60 },
  { name: 'YouTube 1080p', aspectRatio: '16:9', resolution: '1920x1080', fps: 30 },
  { name: 'Instagram Reel', aspectRatio: '9:16', resolution: '1080x1920', fps: 30 },
  { name: 'TikTok', aspectRatio: '9:16', resolution: '1080x1920', fps: 30 },
  { name: 'YouTube Short', aspectRatio: '9:16', resolution: '1080x1920', fps: 60 },
  { name: 'Square (IG Post)', aspectRatio: '1:1', resolution: '1080x1080', fps: 30 },
  { name: 'Social 4:5', aspectRatio: '4:5', resolution: '1080x1350', fps: 30 },
  { name: 'Ultrawide', aspectRatio: '21:9', resolution: '2560x1080', fps: 30 },
];

export default define({
  tag: 'project-view',
  [router.connect]: { url: '/project/:projectId', stack: [EditorView] },
  projectId: '',
  project: { value: null, connect: () => {} },
  media: { value: [], connect: () => {} },
  _scanning: false,
  _scanStatus: { value: null, connect: () => {} },
  _init: {
    value: false,
    connect(host, _key, invalidate) {
      const id = host.projectId;
      if (!id) return;
      fetch(`/api/projects/${id}`)
        .then((r) => r.json())
        .then((p) => {
          host.project = p;
          invalidate();
          // Load media for this project
          fetch(`/api/media?projectId=${id}`)
            .then((r) => r.json())
            .then((d) => {
              host.media = d.data || [];
              invalidate();
            });
        });
    },
  },
  render: {
    value: ({ project, media, projectId }) => {
      if (!project) return html`<div class="project-view"><p>Loading...</p></div>`;

      const videoCount = media.filter((m) => m.type === 'video').length;
      const audioCount = media.filter((m) => m.type === 'audio').length;
      const imageCount = media.filter((m) => m.type === 'image').length;
      const totalDur = media.reduce((sum, m) => sum + (m.duration || 0), 0);
      const adaptations = project.adaptations || [];

      return html`
        <div class="project-view">
          <header class="project-header">
            <a href="/" class="btn btn-ghost"
              ><app-icon name="chevron" size="sm"></app-icon> Projects</a
            >
            <h1>${project.name}</h1>
          </header>

          <div class="project-grid">
            <!-- Media Folders -->
            <section class="project-section">
              <h2><app-icon name="folder" size="sm"></app-icon> Media Folders</h2>
              <p class="folder-note">
                Project folder is always scanned. Add external drives or shared libraries below.
              </p>
              <ul class="folder-list">
                ${(project.mediaFolders || []).map(
                  (f) => html` <li class="folder-item">${f}</li> `,
                )}
                ${!project.mediaFolders?.length
                  ? html`<li class="folder-empty">
                      No additional folders — scanning project directory only
                    </li>`
                  : html``}
              </ul>
              <div class="folder-add">
                <input type="text" placeholder="/Volumes/External/footage" id="newFolder" />
                <button
                  class="btn btn-ghost"
                  onclick="${async (host) => {
                    const path = await pickFolder();
                    if (path) host.querySelector('#newFolder').value = path;
                  }}"
                >
                  <app-icon name="folder" size="sm"></app-icon>
                </button>
                <button
                  class="btn btn-secondary"
                  onclick="${(host) => {
                    const input = host.querySelector('#newFolder');
                    const val = input.value.trim();
                    if (!val) return;
                    const folders = [...(host.project.mediaFolders || []), val];
                    fetch(`/api/projects/${projectId}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ mediaFolders: folders }),
                    })
                      .then((r) => r.json())
                      .then((p) => {
                        host.project = p;
                        input.value = '';
                      });
                  }}"
                >
                  Add
                </button>
              </div>
              <button
                class="btn btn-primary"
                style="margin-top: var(--space-sm); width: 100%;"
                onclick="${(host) => {
                  host._scanning = true;
                  const evtSource = new EventSource(
                    '/api/index?' + new URLSearchParams({ projectId }),
                  );
                  // POST to start, then listen
                  fetch('/api/index', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId }),
                  }).then((r) => {
                    const reader = r.body.getReader();
                    const decoder = new TextDecoder();
                    /**
                     *
                     */
                    function read() {
                      reader.read().then(({ done, value }) => {
                        if (done) {
                          host._scanning = false;
                          return;
                        }
                        const text = decoder.decode(value);
                        const lines = text.split('\n').filter((l) => l.startsWith('data: '));
                        for (const line of lines) {
                          const msg = JSON.parse(line.slice(6));
                          host._scanStatus = msg;
                          if (msg.status === 'complete') {
                            host._scanning = false;
                            // Refresh media
                            fetch(`/api/media?projectId=${projectId}`)
                              .then((r) => r.json())
                              .then((d) => {
                                host.media = d.data || [];
                              });
                          }
                        }
                        read();
                      });
                    }
                    read();
                  });
                }}"
              >
                <app-icon name="ai" size="sm"></app-icon>
                ${(host) => (host._scanning ? 'Scanning...' : 'Scan & Index Media')}
              </button>
            </section>

            <!-- Content Stats -->
            <section class="project-section">
              <h2><app-icon name="film" size="sm"></app-icon> Content</h2>
              <div class="stats-grid">
                <div class="stat">
                  <span class="stat-val">${videoCount}</span><span class="stat-label">Videos</span>
                </div>
                <div class="stat">
                  <span class="stat-val">${audioCount}</span><span class="stat-label">Audio</span>
                </div>
                <div class="stat">
                  <span class="stat-val">${imageCount}</span><span class="stat-label">Images</span>
                </div>
                <div class="stat">
                  <span class="stat-val">${(totalDur / 60).toFixed(1)}m</span
                  ><span class="stat-label">Total</span>
                </div>
              </div>
            </section>

            <!-- Adaptations -->
            <section class="project-section project-section-wide">
              <h2><app-icon name="layers" size="sm"></app-icon> Adaptations</h2>
              <ul class="adaptation-list">
                ${adaptations.map(
                  (a) => html`
                    <li class="adaptation-item">
                      <div class="adaptation-info">
                        <strong>${a.name}</strong>
                        <span class="badge badge-info">${a.aspectRatio}</span>
                        <span class="adaptation-meta">${a.resolution} @ ${a.fps}fps</span>
                      </div>
                      <a
                        href="${router.url(EditorView, { projectId, adaptationId: a.id })}"
                        class="btn btn-primary"
                        >Edit</a
                      >
                    </li>
                  `,
                )}
              </ul>

              <h3>Add from Preset</h3>
              <div class="preset-grid">
                ${PRESETS.map(
                  (p) => html`
                    <button
                      class="btn btn-secondary preset-btn"
                      onclick="${(host) => {
                        const newAdapt = {
                          name: p.name,
                          aspectRatio: p.aspectRatio,
                          resolution: p.resolution,
                          fps: p.fps,
                        };
                        fetch(`/api/projects/${projectId}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            adaptations: [
                              ...adaptations,
                              {
                                ...newAdapt,
                                id: crypto.randomUUID(),
                                parentAdaptationId: '',
                                status: 'draft',
                                edl: {
                                  playheadPosition: 0,
                                  cursorPosition: 0,
                                  zoom: 1,
                                  scrollX: 0,
                                  tracks: [
                                    {
                                      trackId: 'v1',
                                      type: 'video',
                                      name: 'Video 1',
                                      muted: false,
                                      solo: false,
                                      clips: [],
                                    },
                                    {
                                      trackId: 'a1',
                                      type: 'audio',
                                      name: 'Audio 1',
                                      muted: false,
                                      solo: false,
                                      clips: [],
                                    },
                                  ],
                                },
                              },
                            ],
                          }),
                        })
                          .then((r) => r.json())
                          .then((proj) => {
                            host.project = proj;
                          });
                      }}"
                    >
                      <span>${p.name}</span>
                      <small>${p.aspectRatio} ${p.resolution}</small>
                    </button>
                  `,
                )}
              </div>
            </section>
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});
