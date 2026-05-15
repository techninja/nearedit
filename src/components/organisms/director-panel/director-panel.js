/**
 * Director panel — schema-driven form for AI edit directives.
 * UI only — schemas in directorSchemas.js, logic in directorSubmit.js.
 * @module components/organisms/director-panel
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { DIRECTIVE_SCHEMAS } from '#utils/directorSchemas.js';
import { executeSilenceRemoval, submitDirectorJob } from '#utils/directorSubmit.js';
import '#atoms/app-icon/index.js';

/** Render a single form field from schema definition */
function renderField(key, field, values, onChange, textFiles) {
  const val = values[key] ?? field.default;

  if (field.type === 'select') {
    return html`<div class="director-field"><label>${field.label}</label>
      <select onchange="${(h, e) => onChange(key, e.target.value)}">
        ${field.options.map((o) => html`<option value="${o}" selected="${o === val}">${o}</option>`)}
      </select></div>`;
  }
  if (field.type === 'range') {
    return html`<div class="director-field director-field-range">
      <label>${field.label} <span class="range-val">${field.format ? field.format(val) : val}</span></label>
      <input type="range" min="${field.min}" max="${field.max}" step="${field.step}" value="${val}" oninput="${(h, e) => onChange(key, parseFloat(e.target.value))}" /></div>`;
  }
  if (field.type === 'toggle') {
    return html`<div class="director-field director-field-toggle"><label>
      <input type="checkbox" checked="${val}" onchange="${(h, e) => onChange(key, e.target.checked)}" /> ${field.label}</label></div>`;
  }
  if (field.type === 'prompt-source') {
    return html`<div class="director-field director-field-prompt">
      <label>${field.label}</label>
      ${textFiles.length ? html`<select class="prompt-file-select" onchange="${(host, e) => {
        const path = e.target.value;
        if (!path) return;
        e.target.selectedIndex = 0;
        fetch('/api/media/file?path=' + encodeURIComponent(path)).then((r) => r.text()).then((t) => {
          const current = document.querySelector('director-panel').values[key] || '';
          onChange(key, current ? current + '\n\n' + t : t);
        });
      }}"><option value="">Load from script file...</option>${textFiles.map((f) => html`<option value="${f.filePath}">${f.filename}</option>`)}</select>` : html``}
      <textarea rows="3" placeholder="${field.placeholder || ''}" oninput="${(h, e) => onChange(key, e.target.value)}">${val}</textarea></div>`;
  }
  if (field.type === 'text') {
    return html`<div class="director-field"><label>${field.label}</label>
      <input type="text" placeholder="${field.placeholder || ''}" value="${val}" oninput="${(h, e) => onChange(key, e.target.value)}" /></div>`;
  }
  return html``;
}

export default define({
  tag: 'director-panel',
  timeline: store(TimelineState),
  action: 'generate_edit',
  collapsed: true,
  values: { value: {}, connect: () => {} },
  textFiles: { value: [], connect(host) {
    const editor = document.querySelector('editor-view');
    const pid = editor?.projectId || '';
    fetch(`/api/media?projectId=${pid}`).then((r) => r.json()).then((d) => { host.textFiles = (d.data || []).filter((f) => f.type === 'text'); });
  }},
  submitting: false,
  statusMsg: '',
  render: {
    value: ({ action, values, submitting, statusMsg, collapsed, timeline, textFiles }) => {
      const schema = DIRECTIVE_SCHEMAS[action];
      if (!schema) return html``;
      const onChange = (key, val) => { document.querySelector('director-panel').values = { ...values, [key]: val }; };

      return html`
        <div class="director-panel ${collapsed ? 'collapsed' : ''}">
          <div class="director-header">
            <div class="director-actions">
              ${Object.entries(DIRECTIVE_SCHEMAS).map(([k, s]) => html`
                <button class="btn ${action === k ? 'btn-primary' : 'btn-ghost'}" onclick="${(host) => { host.action = k; host.values = {}; host.collapsed = false; }}">${s.title}</button>
              `)}
            </div>
            <button class="btn btn-ghost director-toggle" onclick="${(host) => { host.collapsed = !host.collapsed; }}">
              <app-icon name="${collapsed ? 'maximize' : 'minimize'}" size="sm"></app-icon>
            </button>
          </div>
          <div class="director-dropdown">
            ${submitting ? html`<div class="director-overlay"><span class="spinner"></span><span class="director-overlay-status">${statusMsg || 'Working...'}</span></div>` : html``}
            <div class="director-form">
              <p class="director-desc">${schema.description}</p>
              ${Object.entries(schema.fields).map(([k, f]) => renderField(k, f, values, onChange, textFiles))}
            </div>
            <div class="director-submit">
              <button class="btn btn-primary" disabled="${submitting}" onclick="${async (host) => {
                host.submitting = true;
                host.statusMsg = 'Preparing...';
                const params = Object.fromEntries(Object.entries(schema.fields).map(([k, f]) => [k === 'promptSource' ? 'prompt' : k, host.values[k] ?? f.default]));
                const editor = document.querySelector('editor-view');
                const projectId = editor?.projectId || '';
                try {
                  if (action === 'remove_silence') {
                    const ok = await executeSilenceRemoval(timeline, params, (msg) => { host.statusMsg = msg; });
                    if (ok) host.collapsed = true;
                  } else {
                    const directive = { action, params, context: { playheadPosition: timeline.playheadPosition, totalTracks: timeline.tracks.length, fps: timeline.fps, resolution: timeline.resolution } };
                    await submitDirectorJob(directive, projectId, timeline, params.replaceTimeline ?? false,
                      (msg) => { host.statusMsg = msg; },
                      () => { host.statusMsg = ''; host.collapsed = true; host.submitting = false; },
                      (err) => { host.statusMsg = 'Error: ' + err; host.submitting = false; },
                    );
                    return; // submitting state managed by callbacks
                  }
                } catch (err) { host.statusMsg = 'Error: ' + err.message; }
                host.submitting = false;
              }}"><app-icon name="ai" size="sm"></app-icon> ${submitting ? 'Working...' : 'Execute'}</button>
            </div>
          </div>
        </div>
      `;
    },
    shadow: false,
  },
});
