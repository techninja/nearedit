/**
 * Media bin — compact file browser with type filtering and tags.
 * Fills available sidebar space. Adding clips creates linked pairs.
 * @module components/organisms/media-bin
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { pushState } from '#utils/undoHistory.js';
import '#atoms/app-icon/index.js';

/** Add a clip to the timeline */
function addToTimeline(timeline, item) {
  pushState(timeline);
  const duration = item.duration || 5;
  const ts = Date.now().toString(36);
  const file = item.filePath;
  const xform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, anchorX: 0.5, anchorY: 0.5 };
  const tracks = (timeline.tracks || []).map((t) => {
    if (item.type === 'video' || item.type === 'image') {
      if (t.type === 'video') {
        const end = t.clips.reduce((m, c) => Math.max(m, c.timelineEnd), 0);
        return { ...t, clips: [...t.clips, { clipId: `vclip_${ts}`, sourceFile: file, sourceIn: 0, sourceOut: duration, timelineStart: end, timelineEnd: end + duration, fadeIn: 0, fadeOut: 0, linkedClipId: `aclip_${ts}`, placeholder: false, label: '', prompt: '', intent: '', color: '', transform: xform }] };
      }
      if (t.type === 'audio') {
        const end = t.clips.reduce((m, c) => Math.max(m, c.timelineEnd), 0);
        return { ...t, clips: [...t.clips, { clipId: `aclip_${ts}`, sourceFile: file, sourceIn: 0, sourceOut: duration, timelineStart: end, timelineEnd: end + duration, fadeIn: 0, fadeOut: 0, linkedClipId: `vclip_${ts}`, placeholder: false, label: '', prompt: '', intent: '', color: '', transform: xform }] };
      }
    } else if (item.type === 'audio' && t.type === 'audio') {
      const end = t.clips.reduce((m, c) => Math.max(m, c.timelineEnd), 0);
      return { ...t, clips: [...t.clips, { clipId: `clip_${ts}`, sourceFile: file, sourceIn: 0, sourceOut: duration, timelineStart: end, timelineEnd: end + duration, fadeIn: 0, fadeOut: 0, linkedClipId: '', placeholder: false, label: '', prompt: '', intent: '', color: '', transform: xform }] };
    }
    return t;
  });
  store.set(TimelineState, { ...timeline, tracks });
}

export default define({
  tag: 'media-bin',
  timeline: store(TimelineState),
  filter: 'all',
  items: { value: [], connect(host) {
    const editor = document.querySelector('editor-view');
    const pid = editor?.projectId || '';
    fetch(`/api/media?projectId=${pid}`).then((r) => r.json()).then((d) => { host.items = d.data || []; });
  }},
  render: {
    value: ({ items, timeline, filter }) => {
      const filtered = filter === 'all' ? items : items.filter((i) => i.type === filter);
      const counts = { all: items.length, video: items.filter((i) => i.type === 'video').length, audio: items.filter((i) => i.type === 'audio').length, image: items.filter((i) => i.type === 'image').length, text: items.filter((i) => i.type === 'text').length };

      return html`
        <div class="media-bin">
          <div class="media-bin-header">
            <h3>Media</h3>
            <span class="media-bin-dur">${counts.all} files</span>
          </div>
          <div class="media-bin-filter">
            ${['all', 'video', 'audio', 'image', 'text'].map((t) => html`
              <button class="btn btn-ghost ${filter === t ? 'active' : ''}" onclick="${(host) => { host.filter = t; }}">${t} ${counts[t] ? `(${counts[t]})` : ''}</button>
            `)}
          </div>
          <ul class="media-bin-list">
            ${filtered.map((item) => html`
              <li class="media-bin-item">
                ${item.type === 'video' || item.type === 'image'
                  ? html`<img class="media-bin-thumb" src="/api/previews/thumbnail?path=${encodeURIComponent(item.filePath)}&cols=1&height=24" alt="" />`
                  : html`<span class="media-bin-icon"><app-icon name="${item.type === 'audio' ? 'music' : 'file-video'}" size="sm"></app-icon></span>`
                }
                <div class="media-bin-info">
                  <span class="media-bin-name">${item.filename}</span>
                  <div class="media-bin-meta">
                    <span class="media-bin-dur">${item.duration ? (item.duration >= 60 ? `${(item.duration / 60).toFixed(1)}m` : `${item.duration.toFixed(1)}s`) : ''}</span>
                    ${item.tags?.length ? html`<span class="media-bin-tags">${item.tags.slice(0, 4).join(', ')}</span>` : html``}
                  </div>
                </div>
                ${item.type !== 'text' ? html`<button class="btn btn-ghost media-bin-add" onclick="${() => addToTimeline(timeline, item)}">+</button>` : html``}
              </li>
            `)}
          </ul>
        </div>
      `;
    },
    shadow: false,
  },
});
