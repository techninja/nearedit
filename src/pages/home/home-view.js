/**
 * Home page — project listing and creation.
 * @module pages/home
 */

import { html, define, router } from 'hybrids';
import ProjectView from '#pages/project/project-view.js';
import { pickFolder } from '#utils/folderPicker.js';
import '#atoms/app-icon/index.js';

export default define({
  tag: 'home-view',
  [router.connect]: { url: '/', stack: [ProjectView] },
  projects: { value: [], connect(host, _key, invalidate) {
    fetch('/api/projects').then((r) => r.json()).then((d) => {
      host.projects = d.data || [];
      invalidate();
    });
  }},
  showCreate: false,
  render: {
    value: ({ projects, showCreate }) => html`
      <div class="home-view">
        <header class="home-header">
          <h1><app-icon name="film" size="md"></app-icon> NearEdit</h1>
          <p class="home-subtitle">AI-assisted video editing with full manual control</p>
        </header>

        <section class="home-projects">
          <div class="home-projects-header">
            <h2>Projects</h2>
            <button class="btn btn-primary" onclick="${(host) => { host.showCreate = !host.showCreate; }}">
              <app-icon name="plus" size="sm"></app-icon> New Project
            </button>
          </div>

          ${showCreate ? html`
            <div class="create-form">
              <input type="text" id="projName" placeholder="Project name" />
              <input type="text" id="projPath" placeholder="/path/to/project/folder" />
              <button class="btn btn-ghost" onclick="${async (host) => {
                const path = await pickFolder();
                if (path) host.querySelector('#projPath').value = path;
              }}"><app-icon name="folder" size="sm"></app-icon></button>
              <input type="text" id="projMedia" placeholder="/path/to/media/folder (optional)" />
              <button class="btn btn-ghost" onclick="${async (host) => {
                const path = await pickFolder();
                if (path) host.querySelector('#projMedia').value = path;
              }}"><app-icon name="folder" size="sm"></app-icon></button>
              <div class="create-actions">
                <button class="btn btn-ghost" onclick="${(host) => { host.showCreate = false; }}">Cancel</button>
                <button class="btn btn-primary" onclick="${(host) => {
                  const name = host.querySelector('#projName').value.trim();
                  const path = host.querySelector('#projPath').value.trim();
                  const media = host.querySelector('#projMedia').value.trim();
                  if (!name || !path) return;
                  const body = { name, path };
                  fetch('/api/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  }).then((r) => r.json()).then((proj) => {
                    // Add media folder if provided
                    if (media) {
                      fetch(`/api/projects/${proj.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sourceFolders: [media] }),
                      });
                    }
                    host.showCreate = false;
                    // Refresh list
                    fetch('/api/projects').then((r) => r.json()).then((d) => { host.projects = d.data || []; });
                  });
                }}"><app-icon name="check" size="sm"></app-icon> Create & Scan</button>
              </div>
            </div>
          ` : html``}

          ${projects.length ? html`
            <ul class="project-list">
              ${projects.map((p) => html`
                <li class="project-card">
                  <a href="${router.url(ProjectView, { projectId: p.id })}">
                    <strong>${p.name}</strong>
                    ${p.description ? html`<p>${p.description}</p>` : html``}
                    <span class="project-meta">
                      ${p.adaptations?.length || 0} adaptation${p.adaptations?.length !== 1 ? 's' : ''}
                    </span>
                  </a>
                </li>
              `)}
            </ul>
          ` : html`
            <div class="home-empty">
              <p>No projects yet. Create one to get started.</p>
            </div>
          `}
        </section>
      </div>
    `,
    shadow: false,
  },
});
