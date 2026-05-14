/**
 * Media bin — lists available source files from the media library.
 * Adding a video creates linked video + audio clips on their respective tracks.
 * @module components/organisms/media-bin
 */

import { html, define, store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { pushState } from '#utils/undoHistory.js';

/**
 * Add a clip to the timeline. Video files create linked pairs.
 * @param {object} timeline
 * @param {object} item
 */
function addToTimeline(timeline, item) {
  pushState(timeline);
  const duration = item.duration || 5;
  const ts = Date.now().toString(36);
  const existingTracks = timeline.tracks || [];
  // Use absolute filePath for serving
  const file = item.filePath;

  if (item.type === 'video') {
    // Create linked video + audio clip pair
    const videoClipId = `vclip_${ts}`;
    const audioClipId = `aclip_${ts}`;
    const xform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, anchorX: 0.5, anchorY: 0.5 };

    const tracks = existingTracks.map((t) => {
      if (t.type === 'video') {
        const lastEnd = t.clips.reduce((max, c) => Math.max(max, c.timelineEnd), 0);
        return { ...t, clips: [...t.clips, {
          clipId: videoClipId,
          sourceFile: file,
          sourceIn: 0,
          sourceOut: duration,
          timelineStart: lastEnd,
          timelineEnd: lastEnd + duration,
          fadeIn: 0,
          fadeOut: 0,
          linkedClipId: audioClipId,
          transform: xform,
        }]};
      }
      if (t.type === 'audio') {
        const lastEnd = t.clips.reduce((max, c) => Math.max(max, c.timelineEnd), 0);
        return { ...t, clips: [...t.clips, {
          clipId: audioClipId,
          sourceFile: file,
          sourceIn: 0,
          sourceOut: duration,
          timelineStart: lastEnd,
          timelineEnd: lastEnd + duration,
          fadeIn: 0,
          fadeOut: 0,
          linkedClipId: videoClipId,
          transform: xform,
        }]};
      }
      return t;
    });
    store.set(TimelineState, { ...timeline, tracks });
  } else {
    // Audio-only: just add to audio track
    const clip = {
      clipId: `clip_${ts}`,
      sourceFile: file,
      sourceIn: 0,
      sourceOut: duration,
      timelineStart: 0,
      timelineEnd: duration,
      fadeIn: 0,
      fadeOut: 0,
      linkedClipId: '',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, anchorX: 0.5, anchorY: 0.5 },
    };

    const tracks = existingTracks.map((t) => {
      if (t.type !== 'audio') return t;
      const lastEnd = t.clips.reduce((max, c) => Math.max(max, c.timelineEnd), 0);
      clip.timelineStart = lastEnd;
      clip.timelineEnd = lastEnd + duration;
      return { ...t, clips: [...t.clips, clip] };
    });
    store.set(TimelineState, { ...timeline, tracks });
  }
}

export default define({
  tag: 'media-bin',
  timeline: store(TimelineState),
  items: { value: [], connect: (host) => {
    // Find projectId from the editor-view ancestor
    const editor = document.querySelector('editor-view');
    const projectId = editor?.projectId || '';
    fetch(`/api/media?projectId=${projectId}`).then((r) => r.json()).then((d) => { host.items = d.data || []; });
  }},
  render: {
    value: ({ items, timeline }) => html`
      <div class="media-bin">
        <h3 class="media-bin-title">Media Library</h3>
        <ul class="media-bin-list">
          ${items.map((item) => html`
            <li class="media-bin-item">
              ${item.type === 'video' || item.type === 'image'
                ? html`<img class="media-bin-thumb" src="/api/previews/thumbnail?path=${encodeURIComponent(item.filePath)}&cols=1&height=40" alt="" />`
                : html`<span class="media-bin-type badge badge-success">♪</span>`
              }
              <span class="media-bin-name">${item.filename}</span>
              ${item.global ? html`<span class="badge badge-info">G</span>` : html``}
              <span class="media-bin-dur">${item.duration ? item.duration.toFixed(1) + 's' : '—'}</span>
              <button class="btn btn-ghost" onclick="${() => addToTimeline(timeline, item)}">+ Add</button>
            </li>
          `)}
        </ul>
      </div>
    `,
    shadow: false,
  },
});
