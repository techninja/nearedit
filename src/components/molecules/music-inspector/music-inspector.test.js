import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { setMusicRendering } from '#utils/edl/musicClip.js';
import { clipOf } from '#utils/edl/testkit.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { inspectorModel } from '#utils/inspector/model.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { closeMusicEditor, musicEditorState } from '#utils/musicUi/editorState.js';
import { resetRenderings, syncRenderings } from '#utils/musicUi/rendering.js';
import { musicDoc, renderingOf } from '#utils/musicUi/testkit.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './music-inspector.js';

let clipId = '';
const clip = () => clipOf(getDoc(), clipId);
const steps = () => {
  let n = 0;
  while (undo()) n++;
  return n;
};

async function mount({ rendered = true } = {}) {
  const made = musicDoc();
  clipId = made.clipId;
  const answer = renderingOf(clipOf(made.doc, clipId).music.song);
  loadDoc(rendered ? setMusicRendering(made.doc, clipId, answer) : made.doc);
  const el = await fixture('<music-inspector style="display:block;width:340px"></music-inspector>');
  const show = async () => {
    el.model = inspectorModel(getDoc(), [clipId], 0);
    await settle();
  };
  await show();
  return { el, show };
}

describe('music-inspector', () => {
  let api;
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/fields.css',
      'styles/buttons.css',
      'styles/components-create.css',
    ]),
  );
  beforeEach(async () => {
    resetRenderings();
    await store.set(ProjectState, { projectId: 'p1' });
    api = mockApi({
      'POST /api/music/render': [
        422,
        { error: 'The song cannot be rendered', fields: { bpm: 'is too fast' } },
      ],
    });
  });
  afterEach(() => {
    closeMusicEditor();
    resetRenderings();
    api.restore();
  });

  it('shows the song of the one selected music clip, and nothing for any other selection', async () => {
    const { el } = await mount();
    expect(el.querySelector('.field-group-title').textContent).to.equal('Music');
    expect(el.querySelector('field-number[name="bpm"] input.field-num').value).to.equal('120');
    expect(el.querySelector('select[data-name="key"]').value).to.equal('C');
    expect(el.querySelector('select[data-name="scale"]').value).to.equal('minor');
    expect(
      [...el.querySelectorAll('.music-inspector-part')].map((part) => part.textContent),
    ).to.deep.equal(['808 drums', 'Bass']);
    expect(el.querySelector('.music-inspector-status').textContent.trim()).to.equal(
      'Rendered · 0:06',
    );
    el.model = inspectorModel(getDoc(), [], 0);
    await settle();
    expect(el.children.length).to.equal(0);
  });

  it('changes the tempo and the key as edits of the song: one undo step each, the clip follows', async () => {
    const { el } = await mount();
    const tempo = el.querySelector('field-number[name="bpm"] input.field-num');
    tempo.focus();
    tempo.value = '90';
    tempo.dispatchEvent(new Event('input', { bubbles: true }));
    tempo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(clip().music.song.bpm).to.equal(90);
    expect(clip().timelineEnd, 'two bars at 90 and the tail').to.be.closeTo(16 / 3 + 2, 0.04);
    const key = el.querySelector('select[data-name="key"]');
    key.value = 'F#';
    key.dispatchEvent(new Event('change', { bubbles: true }));
    expect(clip().music.song.key).to.equal('F#');
    expect(steps()).to.equal(2);
  });

  it('mutes a part from the list', async () => {
    const { el, show } = await mount();
    el.querySelector('button[data-part="s"]').click();
    expect(clip().music.song.parts[1].mute).to.equal(true);
    await show();
    expect(el.querySelector('button[data-part="s"]').getAttribute('aria-pressed')).to.equal('true');
    el.querySelector('button[data-part="s"]').click();
    expect(clip().music.song.parts[1].mute).to.equal(false);
  });

  it('says where the rendering stands: on its way, or failed with the server’s sentence', async () => {
    const { el } = await mount({ rendered: false });
    expect(el.querySelector('.music-inspector-status').dataset.state).to.equal('rendering');
    syncRenderings();
    await waitUntil(() => el.querySelector('.error-message'));
    expect(el.querySelector('.music-inspector-status').textContent.trim()).to.equal(
      'Could not be rendered',
    );
    expect(el.querySelector('.error-message').textContent).to.contain(
      'The song cannot be rendered (bpm: is too fast)',
    );
    const asked = api.calls.length;
    el.querySelector('.error-message .btn').click();
    await waitUntil(() => api.calls.length === asked + 1, 'Try again asks the server again');
  });

  it('opens the music editor and saves the song as a MIDI file', async () => {
    const { el } = await mount();
    const [edit, midi] = el.querySelectorAll('.music-inspector-actions .btn');
    edit.click();
    expect(musicEditorState.get().clipId).to.equal(clipId);
    const saved = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function record() {
      saved.push([this.download, this.href.slice(0, 5)]);
    };
    midi.click();
    HTMLAnchorElement.prototype.click = click;
    expect(saved).to.deep.equal([['808-drums-Bass.mid', 'blob:']]);
  });
});
