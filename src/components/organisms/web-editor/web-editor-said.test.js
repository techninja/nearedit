import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { clipOf } from '#utils/edl/testkit.js';
import { getDoc, loadDoc } from '#utils/editor/session.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { recipeKey } from '#utils/web/index.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import { resetCaptureStatus } from '#utils/webUi/captureStatus.js';
import { closeWebEditor, openWebEditor, webEditorState } from '#utils/webUi/editorState.js';
import { recordingState } from '#utils/webUi/recording.js';
import { resetSnapshots } from '#utils/webUi/snapshot.js';
import { testSnapshot, webDoc } from '#utils/webUi/testkit.js';
import './web-editor.js';

let clipId = '';
const clip = () => clipOf(getDoc(), clipId);
const steps = () => clip().web.recipe.steps;
const snapshots = (api) => api.calls.filter((call) => call.path === '/api/web/snapshot');

/** Answers of a server that can record: job `j1` completes with the clip's recording. */
function routes() {
  return {
    'GET /api/web/status': { available: true, browser: { version: 'Chrome/158' }, reason: '' },
    'POST /api/web/snapshot': (body) =>
      testSnapshot({ title: `After ${body.until} steps`, scrollY: 0 }),
    'POST /api/web/record': [202, { jobId: 'j1' }],
    'GET /api/jobs/j1': { id: 'j1', type: 'web', status: 'complete', progress: 100 },
    'GET /api/jobs/j1/result': (_body) => {
      const key = recipeKey(clip().web.recipe, 30);
      return { file: `/p/.nearedit/web/${key}.mp4`, key, duration: 2.9, title: 'Example' };
    },
  };
}

async function mount(first = []) {
  const made = webDoc(first);
  clipId = made.clipId;
  loadDoc(made.doc);
  const el = await fixture(`<web-editor></web-editor>`);
  openWebEditor(clipId);
  await settle(700); // the snapshot waits for the recipe to settle
  const pick = async (label, action) => {
    el.querySelector(`.web-page-map-el[aria-label="${label}"]`).click();
    await settle();
    const items = [...el.querySelectorAll('timeline-menu .menu-item')];
    if (action) items.find((item) => item.textContent.trim() === action).click();
    await settle();
    return items.map((item) => item.textContent.trim());
  };
  return { el, pick };
}

describe('web-editor and what the recorder says', () => {
  let api;
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/editor.css',
      'styles/overlays.css',
      'styles/fields.css',
      'styles/components-shell.css',
      'styles/components-timeline.css',
      'styles/components-create.css',
    ]),
  );
  beforeEach(async () => {
    resetCaptureStatus();
    resetSnapshots();
    recordingState.set({ byClip: {} });
    await store.set(ProjectState, { projectId: 'p1' });
    api = mockApi(routes());
  });
  afterEach(() => {
    closeWebEditor();
    api.restore();
  });

  it('shows what the recorder says about a step on that step, with what can be done', async () => {
    const said = 'Step 2 (click): css=#veiled is covered by <div#veil.veil.chat> "Chat with us"';
    api.restore();
    api = mockApi({
      ...routes(),
      'POST /api/web/snapshot': (body) =>
        body.until >= 2 && !body.recipe.hide.length ? [422, { error: said }] : testSnapshot(),
    });
    const { el } = await mount([{ do: 'wait' }, { do: 'click', target: '#veiled' }]);
    expect(el.querySelector('.web-editor-error').textContent).to.contain('Step 2 cannot be played');
    const notice = el.querySelector('.web-editor-said [data-step="1"]');
    expect(notice.querySelector('strong').textContent).to.equal(said);
    expect(notice.textContent).to.contain('Hide what is in the way');
    const row = el.querySelector('.web-step-list-row[data-index="1"]');
    expect(row.classList.contains('has-problem')).to.equal(true);
    const [goTo, hide] = notice.querySelectorAll('button');
    goTo.click();
    await settle();
    expect(webEditorState.get().selected).to.equal(1);
    expect(
      el.querySelector('web-step-form [data-field="target"] [role="alert"]').textContent,
    ).to.equal(said);
    expect(hide.textContent.trim()).to.equal('Hide div#veil.veil.chat');
    hide.click();
    await settle();
    expect(clip().web.recipe.hide).to.deep.equal(['div#veil.veil.chat']);
    // With the cover hidden the page shows again, and the end lists what is hidden.
    el.querySelector('.web-step-list-end').click();
    await settle(700);
    expect(el.querySelector('.web-editor-said')).to.equal(null);
    expect(el.querySelector('.web-editor-error')).to.equal(null);
    const chip = el.querySelector('.web-editor-hidden .chip');
    expect(chip.textContent).to.contain('div#veil.veil.chat');
    chip.querySelector('button').click();
    await settle();
    expect(clip().web.recipe.hide).to.deep.equal([]);
  });

  it('says in place why the page cannot be shown', async () => {
    api.restore();
    api = mockApi({
      ...routes(),
      'POST /api/web/snapshot': [
        502,
        { error: 'The page did not load', detail: 'net::ERR_NAME_NOT_RESOLVED' },
      ],
    });
    const { el } = await mount();
    const alert = el.querySelector('.web-editor-error');
    expect(alert.textContent).to.contain('The page did not load — net::ERR_NAME_NOT_RESOLVED');
    expect(el.querySelector('web-step-list')).to.not.equal(null);
  });
});
