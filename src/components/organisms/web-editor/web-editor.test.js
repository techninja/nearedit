import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { deleteClips } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { edit, getDoc, loadDoc, undo } from '#utils/editor/session.js';
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

describe('web-editor', () => {
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

  it('is nothing until a web clip is opened in it', async () => {
    loadDoc(webDoc().doc);
    const el = await fixture(`<web-editor></web-editor>`);
    await settle();
    expect(el.querySelector('app-dialog')).to.equal(null);
    expect(snapshots(api).length).to.equal(0);
  });

  it('opens on the page as it loads, with its address, its parts and a way to record', async () => {
    const { el } = await mount();
    expect(el.querySelector('.app-dialog-title').textContent).to.equal('Web clip — example.com');
    expect(el.querySelector('web-topbar input').value).to.equal('https://example.com/');
    expect(snapshots(api).map((call) => call.body.until)).to.deep.equal([0]);
    expect(el.querySelector('.web-page-map-shot')).to.not.equal(null);
    expect(el.querySelector('.web-editor-caption').textContent).to.equal('After 0 steps');
    expect(el.querySelector('.web-step-list-end').getAttribute('aria-selected')).to.equal('true');
    expect(el.querySelector('.web-editor-settings')).to.not.equal(null);
    expect(el.querySelector('web-record-bar [role="status"]').textContent).to.equal('Not recorded');
    expect(el.querySelectorAll('web-score-strip .web-score-strip-block').length).to.equal(2);
  });

  it('adds a step for what is pressed on the page, and then shows the page after it', async () => {
    const { el, pick } = await mount();
    const offered = await pick('button: Get started', 'Click');
    expect(offered).to.deep.equal([
      'button · Get started',
      'Click',
      'Hover',
      'Type into',
      'Scroll to',
      'Highlight',
      'Zoom in',
      'This point instead…',
    ]);
    expect(steps().map((step) => [step.do, step.target])).to.deep.equal([
      ['click', 'text=Get started'],
    ]);
    expect(webEditorState.get().selected).to.equal(1);
    await settle(700);
    expect(snapshots(api).at(-1).body.until).to.equal(1);
    expect(el.querySelector('.web-editor-caption').textContent).to.equal('After 1 steps');
    undo();
    expect(steps().length).to.equal(0);
  });

  it('goes to a step that still lacks something, so its form shows', async () => {
    const { el, pick } = await mount();
    await pick('input: Email', 'Type into');
    expect(steps()[0]).to.include({ do: 'type', target: 'label=Email', text: '' });
    expect(webEditorState.get().selected).to.equal(0);
    const text = el.querySelector('web-step-form [data-name="text"]');
    expect(text.getAttribute('aria-invalid')).to.equal('true');
    expect(el.querySelector('.web-page-map-el.is-marked').getAttribute('aria-label')).to.equal(
      'input: Email',
    );
  });

  it('adds a step of any kind from the menu under "Add a step"', async () => {
    const { el } = await mount();
    el.querySelector('web-step-list .web-step-list-add').click();
    await settle();
    const items = [...el.querySelectorAll('timeline-menu .menu-item')];
    expect(items.length).to.equal(13);
    expect(items[0].textContent.trim()).to.equal('Wait — The page plays on');
    items.find((item) => item.textContent.includes('Scroll —')).click();
    await settle();
    expect(steps().map((step) => step.do)).to.deep.equal(['scroll']);
    // A scroll goes nowhere yet: its form is up to say so.
    expect(webEditorState.get().selected).to.equal(0);
    expect(el.querySelector('web-step-form [role="alert"]').textContent).to.contain('scroll needs');
  });

  it('edits a field as one undo step, however much is typed', async () => {
    const { el } = await mount([{ do: 'type', text: 'a', target: 'label=Email' }]);
    el.querySelector('.web-step-list-row[data-index="0"]').click();
    await settle();
    const text = el.querySelector('web-step-form [data-name="text"]');
    for (const typed of ['h', 'he', 'hello']) {
      text.value = typed;
      text.dispatchEvent(new Event('input', { bubbles: true }));
      await settle(20);
    }
    expect(steps()[0].text).to.equal('hello');
    text.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(el.querySelector('.web-step-list-label').textContent).to.equal('Type: “hello”');
    undo();
    expect(steps()[0].text).to.equal('a');
  });

  it('fills in a target that is being picked instead of adding a step', async () => {
    const { el } = await mount([{ do: 'click', target: '#old' }]);
    el.querySelector('.web-step-list-row[data-index="0"]').click();
    await settle(700);
    el.querySelector('web-step-form .web-step-form-target .icon-btn').click();
    await settle();
    expect(el.querySelector('web-page-map').picking).to.equal(true);
    expect(el.querySelector('.web-editor-caption').textContent).to.contain('step 1 should aim at');
    el.querySelector('.web-page-map-el[aria-label="link: Pricing"]').click();
    await settle();
    expect(steps().map((step) => step.target)).to.deep.equal(['a[href="#pricing"]']);
    expect(webEditorState.get().picking).to.equal('');
    expect(el.querySelector('timeline-menu .menu')).to.equal(null);
  });

  it('retimes from the score strip and changes the recording from the top bar', async () => {
    const { el } = await mount([{ do: 'click', target: '#a' }]);
    const handle = el.querySelector('[data-part="hold"][data-index="0"] .web-score-strip-handle');
    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true }),
    );
    handle.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(steps()[0].hold).to.be.closeTo(28 / 30, 1e-9);
    const size = el.querySelector('web-topbar [data-name="size"]');
    size.value = 'phone';
    size.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(clip().web.recipe.viewport).to.deep.equal({ width: 390, height: 844 });
    undo();
    undo();
    expect(steps()[0].hold).to.equal(undefined);
  });

  it('changes the settings of the whole recording from the form of the end', async () => {
    const { el } = await mount([{ do: 'wait' }]);
    const set = (name, value) => {
      const control = el.querySelector(`.web-editor-settings [data-name="${name}"]`);
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('lead', '1.5');
    set('tail', '0');
    set('onMissing', 'skip');
    set('lead', '');
    await settle();
    const { lead, tail, onMissing } = clip().web.recipe;
    expect([lead, tail, onMissing]).to.deep.equal([1.5, 0, 'skip']);
    expect(el.querySelector('.web-score-strip-total').textContent).to.contain('2.5 s');
    undo();
    expect(clip().web.recipe.onMissing).to.equal('fail');
  });

  it('records, attaches the recording and can then play it', async () => {
    const { el } = await mount([{ do: 'click', target: '#a' }]);
    el.querySelector('web-record-bar .web-record-bar-go').click();
    await settle(300);
    expect(clip().web.key).to.equal(recipeKey(clip().web.recipe, 30));
    expect(el.querySelector('web-record-bar [role="status"]').textContent).to.equal(
      'Recorded 2.9 s · 2560×1440',
    );
    expect(el.querySelector('.app-dialog-title').textContent).to.equal('Web clip — Example');
    el.querySelector('.web-editor-page-bar [data-mode="recording"]').click();
    await settle();
    expect(el.querySelector('web-playback video').getAttribute('src')).to.contain(
      '/api/media/file',
    );
    expect(el.querySelector('web-page-map')).to.equal(null);
  });

  it('undoes with Ctrl+Z inside the dialog, and closes when its clip is gone', async () => {
    const { el, pick } = await mount();
    await pick('button: Get started', 'Hover');
    const body = el.querySelector('.web-editor-body');
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await settle();
    expect(steps().length).to.equal(0);
    body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(steps().length).to.equal(1);
    edit((doc) => deleteClips(doc, [clipId]));
    await settle();
    expect(el.querySelector('app-dialog')).to.equal(null);
    expect(webEditorState.get().clipId).to.equal('');
  });
});
