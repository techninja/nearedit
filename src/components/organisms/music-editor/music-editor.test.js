import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { clipOf } from '#utils/edl/testkit.js';
import { getDoc, loadDoc, redo, undo } from '#utils/editor/session.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { isStaleMusic, renderSong } from '#utils/music/index.js';
import { auditionState, stopAudition } from '#utils/musicUi/audition.js';
import { setAuditionHost } from '#utils/musicUi/auditionHost.js';
import { interleaved } from '#utils/musicUi/auditionRender.js';
import { closeMusicEditor, musicEditorState, openMusicEditor } from '#utils/musicUi/editorState.js';
import { RENDER_DELAY } from '#utils/musicUi/rendering.js';
import { FakeAudioContext, fakeHost } from '#utils/musicUi/testing/fakeAudio.js';
import { musicDoc, renderingOf } from '#utils/musicUi/testkit.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './music-editor.js';

let clipId = '';
const clip = () => clipOf(getDoc(), clipId);
const song = () => clip().music.song;
/** Whether a buffer holds exactly the samples the engine renders for a song. */
function plays(buffer, of) {
  const mine = interleaved(buffer);
  const theirs = renderSong(of);
  return mine.length === theirs.length && mine.every((sample, i) => sample === theirs[i]);
}
const steps = () => {
  let n = 0;
  while (undo()) n++;
  for (let i = 0; i < n; i++) redo();
  return n;
};

async function mount() {
  const made = musicDoc();
  clipId = made.clipId;
  loadDoc(made.doc);
  const el = await fixture('<music-editor></music-editor>');
  openMusicEditor(clipId);
  await settle();
  const body = () => el.querySelector('.music-editor-body');
  const key = (name, more = {}, target = body()) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...more }),
    );
  /** Press a step of the drum grid with the mouse. */
  const press = (drum, step) => {
    const row = el.querySelector(`.music-drum-grid-steps[data-drum="${drum}"]`);
    const box = row.querySelector(`[data-step="${step}"]`).getBoundingClientRect();
    const at = {
      clientX: box.left + 5,
      clientY: box.top + 5,
      bubbles: true,
      button: 0,
      pointerId: 5,
    };
    row.dispatchEvent(new PointerEvent('pointerdown', at));
    row.dispatchEvent(new PointerEvent('pointerup', at));
  };
  const button = (text) =>
    [...el.querySelectorAll('button')].find((each) => each.textContent.trim() === text);
  return { el, body, key, press, button };
}

describe('music-editor', () => {
  let api;
  let ctx;
  before(() =>
    loadStyles([
      ...['styles/tokens.css', 'styles/editor.css', 'styles/overlays.css', 'styles/fields.css'],
      ...['styles/buttons.css', 'styles/components-shell.css', 'styles/components-create.css'],
    ]),
  );
  beforeEach(async () => {
    ctx = new FakeAudioContext('suspended');
    setAuditionHost(fakeHost(ctx));
    await store.set(ProjectState, { projectId: 'p1' });
    api = mockApi({ 'POST /api/music/render': (body) => renderingOf(body.song) });
  });
  afterEach(() => {
    stopAudition();
    closeMusicEditor();
    setAuditionHost();
    api.restore();
  });

  it('is nothing until a music clip is opened in it, then shows its song', async () => {
    const el = await fixture('<music-editor></music-editor>');
    expect(el.querySelector('.dialog')).to.not.exist;
    const opened = await mount();
    expect(opened.el.querySelector('.app-dialog-title').textContent).to.equal(
      'Music — 808 drums, Bass',
    );
    expect(opened.el.querySelector('music-topbar field-number[name="bpm"]').value).to.equal(120);
    expect(opened.el.querySelectorAll('music-part-list .music-part-list-row').length).to.equal(2);
    expect(opened.el.querySelector('music-drum-grid'), 'the first part is open: drums').to.exist;
    expect(opened.el.querySelector('music-sound select[data-name="kit"]').value).to.equal('808');
    expect(openMusicEditor('nobody')).to.equal(false);
  });

  it('edits the song through the session: a press is one undo step, and Ctrl+Z works in the dialog', async () => {
    const { el, key, press } = await mount();
    press('snare', 4);
    press('snare', 12);
    expect(song().parts[0].lanes.snare).to.equal('....x.......x...');
    expect(steps()).to.equal(2);
    key('z', { ctrlKey: true });
    expect(song().parts[0].lanes.snare).to.equal('....x...........');
    key('z', { ctrlKey: true, shiftKey: true });
    expect(song().parts[0].lanes.snare).to.equal('....x.......x...');
    await settle();
    expect(el.querySelector('[data-drum="snare"] [data-step="12"]').dataset.char).to.equal('x');
    const tempo = el.querySelector('music-topbar field-number[name="bpm"] input.field-num');
    tempo.focus();
    tempo.value = '60';
    tempo.dispatchEvent(new Event('input', { bubbles: true }));
    tempo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect([song().bpm, clip().timelineEnd]).to.deep.equal([60, 10]);
    expect(steps()).to.equal(3);
  });

  it('adds a synth part, lets the helpers write it, and changes its sound from the schema', async () => {
    const { el, button } = await mount();
    button('Add synth').click();
    await settle();
    expect(musicEditorState.get().partId).to.equal('p1');
    expect(el.querySelector('music-piano-roll'), 'the new part is open: a piano roll').to.exist;
    button('Write…').click();
    await settle();
    button('Melody').click();
    await settle();
    button('Write').click();
    const first = song().parts[2].notes;
    expect(first.length).to.be.greaterThan(4);
    button('Roll again').click();
    expect(song().parts[2].notes).to.not.deep.equal(first);
    await settle();
    expect(el.querySelectorAll('.music-piano-roll-note').length).to.equal(
      song().parts[2].notes.length,
    );
    const preset = el.querySelector('music-sound select[data-name="preset"]');
    preset.value = 'lead';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    const slider = el.querySelector(
      'music-sound field-number[name="params.osc1Level"] input[type="range"]',
    );
    for (const value of ['0.5', '0.4', '0.3']) {
      slider.value = value;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    expect([song().parts[2].preset, song().parts[2].params]).to.deep.equal([
      'lead',
      { osc1Level: 0.3 },
    ]);
    expect(steps(), 'add, write, roll, preset, one drag of the slider').to.equal(5);
    expect(clip().label, 'the clip is still called after its song').to.equal(
      '808 drums, Bass, Lead',
    );
  });

  it('plays with the engine on Space: the buffer is the song’s own rendering, and follows an edit', async () => {
    const { el, key, press, button } = await mount();
    /** The passes of the loop: single hits are much shorter. */
    const passes = () => ctx.sources.filter((source) => source.buffer.duration > 5);
    key(' ');
    await waitUntil(() => passes().length === 1, 'rendered and started', { timeout: 4000 });
    expect(ctx.state, 'the key press started the context').to.equal('running');
    expect(plays(passes()[0].buffer, song())).to.equal(true);
    await settle();
    expect(button('Stop')).to.exist;
    press('clap', 4);
    await waitUntil(() => passes().length === 2, 'the edited song takes over', { timeout: 4000 });
    expect(plays(passes()[1].buffer, song())).to.equal(true);
    expect(plays(passes()[0].buffer, song()), 'it is another buffer').to.equal(false);
    expect(ctx.sources.length, 'and the pressed clap was heard at once').to.equal(3);
    const name = el.querySelector('input[aria-label="Name of the part"]');
    key(' ', {}, name);
    expect(auditionState.get().playing, 'a space typed in a box is a space').to.equal(true);
    key(' ');
    expect(auditionState.get().playing).to.equal(false);
  });

  it('solos while editing only: the song is not changed, what plays is', async () => {
    const { el, key } = await mount();
    el.querySelector('[data-part="s"] [data-action="solo"]').click();
    await settle();
    expect(el.querySelector('.music-part-list-note')).to.exist;
    key(' ');
    await waitUntil(() => ctx.sources.length === 1, 'started', { timeout: 4000 });
    const bassOnly = { ...song(), parts: [{ ...song().parts[0], mute: true }, song().parts[1]] };
    expect(plays(ctx.sources[0].buffer, bassOnly)).to.equal(true);
    expect(plays(ctx.sources[0].buffer, song())).to.equal(false);
    expect(song().parts.map((part) => part.mute)).to.deep.equal([false, false]);
    expect(steps()).to.equal(0);
  });

  it('gets the clip rendered by itself after an edit, without an undo step', async () => {
    const { el, press } = await mount();
    await waitUntil(() => !isStaleMusic(clip()), 'the new clip is rendered', { timeout: 3000 });
    expect(steps()).to.equal(0);
    press('snare', 4);
    await settle();
    expect(el.querySelector('.music-editor-status').textContent).to.contain('Rendering…');
    await waitUntil(() => !isStaleMusic(clip()), 'rendered again', {
      timeout: RENDER_DELAY + 2000,
    });
    expect(clip().sourceFile).to.equal(renderingOf(song()).file);
    expect(steps(), 'only the press').to.equal(1);
    await settle();
    expect(el.querySelector('.music-editor-status').textContent).to.contain('Rendered');
  });

  it('shows a failure with the sentence of the server and tries again when asked', async () => {
    api.restore();
    let fail = true;
    api = mockApi({
      'POST /api/music/render': (body) =>
        fail ? [503, { error: 'The server is out of disk space' }] : renderingOf(body.song),
    });
    const { el, button } = await mount();
    await waitUntil(() => button('Try again'), 'the failure shows', { timeout: 3000 });
    expect(el.querySelector('.music-editor-status').textContent).to.contain(
      'The server is out of disk space',
    );
    fail = false;
    button('Try again').click();
    await waitUntil(() => !isStaleMusic(clip()), 'rendered this time', { timeout: 3000 });
  });

  it('closes with Done, and by itself when its clip is gone', async () => {
    const { el, key, button } = await mount();
    key(' ');
    await waitUntil(() => ctx.sources.length === 1, 'playing', { timeout: 4000 });
    button('Done').click();
    await settle();
    expect(el.querySelector('.dialog')).to.not.exist;
    expect(auditionState.get().playing, 'closing stops the sound').to.equal(false);
    openMusicEditor(clipId);
    await settle();
    loadDoc({ ...getDoc(), tracks: getDoc().tracks.map((track) => ({ ...track, clips: [] })) });
    await waitUntil(() => !el.querySelector('.dialog'));
    expect(musicEditorState.get().clipId).to.equal('');
  });

  it('shows one of its three parts at a time when there is no room for all', async () => {
    const { el, body } = await mount();
    expect(body().dataset.tab).to.equal('grid');
    const tabs = [...el.querySelectorAll('.music-editor-tabs [role="tab"]')];
    expect(tabs.map((tab) => tab.textContent.trim())).to.deep.equal(['Parts', 'Grid', 'Sound']);
    tabs[2].click();
    await settle();
    expect(body().dataset.tab).to.equal('sound');
  });
});
