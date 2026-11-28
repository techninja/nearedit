/**
 * Inspector group "Music" — for a selected music clip: its tempo, key and
 * length, its parts as a short list with a mute button each, where its
 * rendering stands (a failure with the server's sentence and a way to try
 * again), and buttons to open it in the music editor and to save its song
 * as a MIDI file. Changes are edits of the clip's song; the rendering
 * follows by itself.
 * @module components/molecules/music-inspector
 */

import { define, html } from 'hybrids';
import { partLabel } from '#utils/music/label.js';
import { KEY_CHOICES, SCALE_CHOICES } from '#utils/musicUi/choices.js';
import { musicClipStatus } from '#utils/musicUi/clipStatus.js';
import { number, select } from '#utils/musicUi/fieldParts.js';
import * as on from '#utils/musicUi/inspectorEvents.js';
import { renderState } from '#utils/musicUi/renderState.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-icon/app-icon.js';

/** @typedef {import('#utils/musicUi/inspectorEvents.js').MusicInspectorHost} MusicInspectorHost */

/**
 * A part: what it is and a button that mutes it.
 * @param {any} part
 * @param {boolean} locked
 */
const partRow = (part, locked) =>
  html`<li>
    <app-icon name="${part.kind === 'drums' ? 'beat' : 'piano'}" size="sm"></app-icon>
    <span class="music-inspector-part" title="${partLabel(part)}">${partLabel(part)}</span>
    <button
      type="button"
      class="icon-btn"
      data-part="${part.id}"
      data-muted="${part.mute ? 'true' : 'false'}"
      aria-pressed="${part.mute ? 'true' : 'false'}"
      aria-label="${`Mute ${partLabel(part)}`}"
      title="${part.mute ? 'Muted — click to hear it again' : 'Mute'}"
      disabled="${locked}"
      onclick="${on.handleMute}"
    >
      <app-icon name="${part.mute ? 'mute' : 'volume'}" size="sm"></app-icon>
    </button>
  </li>`.key(part.id);

/** @type {import('hybrids').Component<MusicInspectorHost>} */
export default define({
  tag: 'music-inspector',
  model: { value: /** @type {any} */ ({}) },
  renders: watch(renderState),
  render: {
    value: (host) => {
      const subject = on.subjectOf(host);
      if (!subject) return html``;
      const { clip, track } = subject;
      const { song } = clip.music;
      const locked = Boolean(host.model.locked);
      const status = musicClipStatus(clip, host.renders.byClip[clip.clipId], track.locked);
      return html`<div class="music-inspector" onfield-change="${on.handleField}">
        <div class="field-group-title">Music</div>
        ${number('bpm', 'Tempo', song.bpm, 'bpm', { disabled: locked })}
        <div class="field-row">
          <span class="field-label">Key</span>
          <span class="field-pair">
            ${select('key', 'Key', KEY_CHOICES, song.key, locked, on.handleChoice)}
            ${select('scale', 'Scale', SCALE_CHOICES, song.scale, locked, on.handleChoice)}
          </span>
        </div>
        ${number('bars', 'Bars', song.bars, 'bars', { disabled: locked })}
        <div class="field-row music-inspector-list">
          <span class="field-label">Parts</span>
          ${song.parts.length
            ? html`<ul>
                ${song.parts.map((part) => partRow(part, locked))}
              </ul>`
            : html`<span class="music-inspector-none">None yet — open the editor to add one</span>`}
        </div>
        <div class="field-row">
          <span class="field-label">Status</span>
          <span class="music-inspector-status" data-state="${status.state}" role="status"
            >${status.text}</span
          >
        </div>
        ${status.message &&
        html`<p class="error-message" role="alert">
          ${status.message}
          <button type="button" class="btn btn-ghost" onclick="${on.handleRetry}">Try again</button>
        </p>`}
        <div class="music-inspector-actions">
          <button type="button" class="btn btn-primary" onclick="${on.handleEdit}">
            <app-icon name="edit" size="sm"></app-icon> Edit…
          </button>
          <button type="button" class="btn btn-secondary" onclick="${on.handleExport}">
            <app-icon name="export" size="sm"></app-icon> Export MIDI
          </button>
        </div>
      </div>`;
    },
    shadow: false,
  },
});
