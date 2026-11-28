import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { testClip } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { VEGAS_KEYS } from '#utils/keyboard/presets.js';
import { closeMusicEditor, musicEditorState } from '#utils/musicUi/editorState.js';
import { renderState } from '#utils/musicUi/renderState.js';
import { musicDoc } from '#utils/musicUi/testkit.js';
import { contextMenu } from '#utils/timeline/menuModel.js';
import { musicMenu } from '#utils/timeline/menuMusic.js';
import * as commands from './index.js';
import { getCommand, isEnabled, runCommand } from './registry.js';
import { selectClipSpan } from './timeSelection.js';

let clipId = '';
const select = (ids) => store.set(ViewState, { selection: ids, loopStart: 0, loopEnd: 0 });
const labels = (items) => items.map((item) => item.label || '-');

describe('music clip commands', () => {
  beforeEach(async () => {
    const made = musicDoc();
    made.doc.tracks[0].clips.push(testClip('picture', 0, 2));
    clipId = made.clipId;
    session.loadDoc(made.doc);
    renderState.set({ byClip: {} });
    await select([]);
  });
  afterEach(closeMusicEditor);

  it('are in the registry, with the same key in both presets', () => {
    assert.deepEqual(getCommand('music.edit').keys, ['Alt+M']);
    assert.deepEqual(VEGAS_KEYS['music.edit'], ['Alt+M']);
    assert.equal(getCommand('music.edit').group, 'Edit');
    assert.deepEqual(getCommand('music.exportMidi').keys, []);
  });

  it('need a selected music clip, and open the music editor on it', async () => {
    assert.equal(isEnabled('music.edit'), false);
    assert.equal(runCommand('music.edit'), false);
    await select(['picture']);
    assert.equal(isEnabled('music.edit'), false);
    await select(['picture', clipId]);
    assert.equal(isEnabled('music.exportMidi'), true);
    assert.equal(runCommand('music.edit'), true);
    const state = musicEditorState.get();
    assert.deepEqual([state.clipId, state.partId], [clipId, 'd'], 'on its first part');
  });

  it('open the music editor on a double-clicked music clip, and still loop any other clip', async () => {
    selectClipSpan(clipId);
    assert.equal(musicEditorState.get().clipId, clipId);
    assert.equal(getView().loopEnd, 0);
    closeMusicEditor();
    selectClipSpan('picture');
    await null;
    assert.equal(musicEditorState.get().clipId, '');
    assert.equal(getView().loopEnd, 2);
  });

  it('put the music entries first in the context menu of a music clip only', () => {
    const doc = session.getDoc();
    assert.deepEqual(labels(musicMenu(doc, { clipId })), ['Edit music…', 'Export MIDI', '-']);
    assert.equal(musicMenu(doc, { clipId })[0].shortcut, 'Alt+M');
    assert.deepEqual(musicMenu(doc, { clipId: 'picture' }), []);
    const menu = contextMenu({ zone: 'lanes', clipId, part: 'body' }, {});
    assert.deepEqual(labels(menu).slice(0, 4), [
      'Edit music…',
      'Export MIDI',
      '-',
      'Split at cursor',
    ]);
    menu[0].run();
    assert.equal(musicEditorState.get().clipId, clipId);
    assert.ok(
      !labels(contextMenu({ zone: 'lanes', clipId: 'picture', part: 'body' }, {})).includes(
        'Edit music…',
      ),
    );
  });

  it('leave F what it would follow when a rendering arrives after an edit', async () => {
    session.edit((doc) => ({
      ...doc,
      tracks: doc.tracks.map((track, i) =>
        i ? track : { ...track, clips: [...track.clips, testClip('later', 4, 6)] },
      ),
    }));
    await select(['picture']);
    commands.deleteSelection();
    assert.equal(commands.canPostRipple(), true);
    session.commit({ ...session.getDoc(), rendered: true }, { record: false });
    assert.equal(commands.canPostRipple(), true, 'an amendment is not an edit');
    commands.postEditRipple('track');
    const later = session.getDoc().tracks[0].clips.find((clip) => clip.clipId === 'later');
    assert.equal(later.timelineStart, 2, 'the later clip followed the delete');
  });

  it('offer to render again where a rendering failed', () => {
    renderState.set({ byClip: { [clipId]: { status: 'failed', key: 'k', message: 'No' } } });
    assert.deepEqual(labels(musicMenu(session.getDoc(), { clipId })).slice(0, 2), [
      'Edit music…',
      'Render again',
    ]);
  });
});
