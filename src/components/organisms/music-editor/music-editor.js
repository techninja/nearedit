/**
 * Music editor organism — the dialog in which one music clip is written:
 * play and the song's tempo, key and mix on top; its parts; the open
 * part's pattern — a step grid for drums, a piano roll for a synth — and
 * its sound. The engine itself plays here while editing: what is heard is
 * the buffer the server will render. Every change edits the clip's song
 * through the edit session, so undo works and autosave keeps it; the
 * clip's rendering follows by itself, without an undo step. Opened by
 * `openMusicEditor(clipId)` (`#utils/musicUi/editorState.js`). While it is
 * mounted, every music clip of the document is kept rendered.
 * @module components/organisms/music-editor
 */

import { define, html } from 'hybrids';
import { liveDoc } from '#utils/editor/liveDoc.js';
import { musicLabel } from '#utils/timeline/clipMarksMusic.js';
import { auditionState } from '#utils/musicUi/audition.js';
import * as on from '#utils/musicUi/editorEvents.js';
import { editorBody, editorFooter } from '#utils/musicUi/editorParts.js';
import { musicClipOf, musicEditorState, shownLoop, shownPart } from '#utils/musicUi/editorState.js';
import * as view from '#utils/musicUi/editorView.js';
import { handlePart } from '#utils/musicUi/partEvents.js';
import * as pattern from '#utils/musicUi/patternEvents.js';
import { renderState, watchMusicRendering } from '#utils/musicUi/rendering.js';
import { dialogFrame } from '#utils/ui/dialogFrame.js';
import { watch } from '#utils/ui/observable.js';
import '#atoms/app-dialog/index.js';
import '#atoms/app-icon/index.js';
import '#molecules/app-tabs/index.js';
import '#molecules/music-drum-grid/index.js';
import '#molecules/music-part-list/index.js';
import '#molecules/music-piano-roll/index.js';
import '#molecules/music-sound/index.js';
import '#molecules/music-topbar/index.js';
import '#molecules/music-write/index.js';

/** @typedef {import('#utils/musicUi/editorView.js').MusicEditorHost} MusicEditorHost */

/** @param {MusicEditorHost} host */
function dialog(host) {
  const { state } = host;
  const found = musicClipOf(state.clipId);
  if (!found) return html``;
  const { clip, track } = found;
  const { song } = clip.music;
  const facts = {
    ...{ clip, song, part: shownPart(state, song) },
    loop: shownLoop(state, song),
    locked: Boolean(track.locked),
  };
  const body = html`<div
    class="music-editor-body"
    data-tab="${state.tab}"
    onfield-change="${on.handleField}"
    onmusic-transport="${on.handleTransport}"
    onmusic-part="${handlePart}"
    onmusic-play="${on.handlePlayStrip}"
    onmusic-steps="${pattern.handleSteps}"
    onmusic-lane="${pattern.handleLane}"
    onmusic-beat="${pattern.handleBeat}"
    onmusic-notes="${pattern.handleNotes}"
    onmusic-select="${pattern.handleSelect}"
    onmusic-hear="${on.handleHear}"
    onmusic-view="${on.handleView}"
    onmusic-write="${pattern.handleWrite}"
    onkeydown="${view.handleKeys}"
  >
    ${editorBody(host, facts)}
  </div>`;
  const title = `Music — ${musicLabel(clip)}`;
  return html`<app-dialog open onclose="${on.handleClose}">
    ${dialogFrame({
      title,
      body,
      footer: editorFooter(host, facts),
      size: 'huge',
      onClose: on.handleClose,
    })}
  </app-dialog>`;
}

/** @type {import('hybrids').Component<MusicEditorHost>} */
export default define({
  tag: 'music-editor',
  state: watch(musicEditorState),
  doc: liveDoc(),
  audition: watch(auditionState),
  renders: watch(renderState),
  services: { value: true, connect: watchMusicRendering },
  render: {
    value: (host) => (host.state.clipId && host.doc ? dialog(host) : html``),
    shadow: false,
    observe: view.sync,
  },
});
