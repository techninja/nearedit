import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { clipOf, testClip } from '#utils/edl/testkit.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { inspectorModel } from '#utils/inspector/model.js';
import { trackOf as testTrack } from '#utils/web/testkit.js';
import { recipeKey } from '#utils/web/index.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import { closeWebEditor, webEditorState } from '#utils/webUi/editorState.js';
import { recordingState } from '#utils/webUi/recording.js';
import { webDoc } from '#utils/webUi/testkit.js';
import './web-inspector.js';

const STEPS = [{ do: 'click', target: 'text=Go' }];
let clipId = '';
const clip = () => clipOf(getDoc(), clipId);

/** A finished job for the clip as it is now, with a track that has one click. */
function recorded() {
  const key = recipeKey(clip().web.recipe, 30);
  const rect = { x: 600, y: 300, width: 120, height: 40 };
  const track = testTrack([{ do: 'click', rect }], { key });
  const result = {
    file: `/p/.nearedit/web/${key}.mp4`,
    key,
    duration: 2.9,
    title: 'Example',
    track,
  };
  return {
    'POST /api/web/record': [202, { jobId: 'j1' }],
    'GET /api/jobs/j1': { id: 'j1', type: 'web', status: 'complete', progress: 100 },
    'GET /api/jobs/j1/result': result,
    'GET /api/web/track': track,
  };
}

async function mount(selection = [clipId]) {
  const el = await fixture(`<web-inspector></web-inspector>`);
  const show = () => (el.model = inspectorModel(getDoc(), selection, 0));
  show();
  await settle();
  const button = (text) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text));
  return { el, show, button, status: () => el.querySelector('.web-inspector-status') };
}

describe('web-inspector', () => {
  let api;
  beforeEach(async () => {
    const made = webDoc(STEPS);
    clipId = made.clipId;
    loadDoc(made.doc);
    recordingState.set({ byClip: {} });
    closeWebEditor();
    await store.set(ProjectState, { projectId: 'p1' });
    api = mockApi(recorded());
  });
  afterEach(() => api.restore());

  it('shows the address, the size and that the clip is not recorded', async () => {
    const { el, status, button } = await mount();
    const values = [...el.querySelectorAll('.web-inspector-value')].map((v) => v.textContent);
    expect(values).to.deep.equal(['https://example.com/', 'Desktop 1280 × 720 · 2×']);
    expect(status().textContent).to.equal('Not recorded');
    expect(button('Record').textContent.trim()).to.equal('Record');
    expect(button('Zoom in on clicks').disabled).to.equal(true);
    expect(button('Remove zoom').disabled).to.equal(true);
  });

  it('shows nothing for other clips, or for several clips at once', async () => {
    const other = await mount(['nope']);
    expect(other.el.children.length).to.equal(0);
    const made = webDoc(STEPS);
    made.doc.tracks[1].clips.push(testClip('sound', 0, 2));
    loadDoc(made.doc);
    const both = await mount([made.clipId, 'sound']);
    expect(both.el.children.length).to.equal(0);
  });

  it('opens the web editor on the clip', async () => {
    const { button } = await mount();
    button('Edit steps').click();
    expect(webEditorState.get().clipId).to.equal(clipId);
  });

  it('records the clip and then says so', async () => {
    const { button, show, status } = await mount();
    button('Record').click();
    await settle(250);
    show();
    await settle();
    expect(api.calls[0].path).to.equal('/api/web/record');
    expect(api.calls[0].body.fps).to.equal(30);
    expect(status().textContent).to.equal('Recorded 2.9 s · 2560×1440');
    expect(status().dataset.state).to.equal('recorded');
    expect(button('Record again')).to.not.equal(undefined);
  });

  it('shows the progress of a recording and lets it be cancelled', async () => {
    api.restore();
    api = mockApi({
      ...recorded(),
      'GET /api/jobs/j1': { id: 'j1', type: 'web', status: 'running', progress: 37 },
      'DELETE /api/jobs/j1': [204, null],
    });
    const { el, button, status } = await mount();
    button('Record').click();
    await settle(250);
    expect(status().textContent).to.equal('Recording 37 %');
    expect(el.querySelector('.progress-bar').style.width).to.equal('37%');
    button('Cancel recording').click();
    await settle(250);
    expect(api.calls.some((call) => call.method === 'DELETE')).to.equal(true);
    expect(status().textContent).to.equal('Not recorded');
  });

  it('zooms in on the clicks of a recorded clip, as keyframes, and removes them again', async () => {
    const { button, show } = await mount();
    button('Record').click();
    await settle(250);
    show();
    await settle();
    button('Zoom in on clicks').click();
    await settle(150);
    show();
    await settle();
    expect(Object.keys(clip().keyframes).sort()).to.deep.equal([
      'transform.scaleX',
      'transform.scaleY',
      'transform.x',
      'transform.y',
    ]);
    expect(button('Remove zoom').disabled).to.equal(false);
    button('Remove zoom').click();
    expect(clip().keyframes['transform.scaleX']).to.equal(undefined);
    undo();
    expect(clip().keyframes['transform.scaleX'].length).to.be.greaterThan(0);
  });

  it('zooms again when a setting changes, and says why when zoom cannot be made', async () => {
    const { el, button, show } = await mount();
    button('Record').click();
    await settle(250);
    show();
    await settle();
    button('Zoom in on clicks').click();
    await settle(150);
    const top = () => Math.max(...clip().keyframes['transform.scaleX'].map((key) => key.v));
    expect(top()).to.equal(2.2);
    const max = el.querySelector('[data-name="maxZoom"]');
    max.value = '1.6';
    max.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(150);
    expect(top()).to.equal(1.6);
    max.value = '2.2';
    max.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(150);
    expect(top()).to.equal(2.2);
  });
});
