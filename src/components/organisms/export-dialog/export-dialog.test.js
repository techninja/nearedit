import { fixture, expect, oneEvent } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { loadDoc } from '#utils/editor/session.js';
import { createClip, createEdl } from '#utils/edl/factory.js';
import { exportState } from '#utils/ui/exportController.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './export-dialog.js';

const PRESETS = [
  { id: 'draft', label: 'Draft', description: 'Half resolution' },
  { id: 'standard', label: 'Standard', description: 'Full resolution' },
];
const plan = (body) => {
  const half = body.preset === 'draft';
  return {
    width: half ? 960 : 1920,
    height: half ? 540 : 1080,
    fps: 30,
    duration: 12,
    warnings: [],
  };
};

describe('export-dialog', () => {
  let api;
  beforeEach(async () => {
    const doc = createEdl();
    doc.tracks[0].clips.push(
      createClip({ clipId: 'c', sourceFile: '/m/a.mp4', sourceOut: 12, timelineEnd: 12 }),
    );
    loadDoc(doc);
    exportState.set({ adaptationId: '', presets: [], job: null, result: null, starting: false });
    await store.set(ProjectState, {
      projectId: 'p1',
      adaptationId: 'a1',
      adaptationName: 'Main Edit',
      loaded: true,
      dirty: false,
    });
    api = mockApi({
      'GET /api/render/presets': { data: PRESETS },
      'POST /api/render/plan': (body) => plan(body),
    });
  });
  afterEach(() => api.restore());

  it('renders nothing while closed', async () => {
    const el = await fixture(`<export-dialog></export-dialog>`);
    await settle();
    expect(el.querySelector('app-dialog')).to.equal(null);
    expect(api.calls.length).to.equal(0);
  });

  it('opens with the presets, the ranges, a file name and what will be rendered', async () => {
    const el = await fixture(`<export-dialog></export-dialog>`);
    el.open = true;
    await settle(200);
    const presets = [...el.querySelectorAll('input[name="preset"]')].map((r) => [
      r.value,
      r.checked,
    ]);
    expect(presets).to.deep.equal([
      ['draft', false],
      ['standard', true],
    ]);
    const ranges = [...el.querySelectorAll('input[name="rangeId"]')].map((r) => [
      r.value,
      r.disabled,
    ]);
    expect(ranges).to.deep.equal([
      ['all', false],
      ['loop', true],
    ]);
    expect(el.querySelector('input[name="filename"]').value).to.equal('Main Edit');
    expect(el.querySelector('.export-dialog-facts').textContent).to.contain(
      '1920 × 1080 · 30 fps · 0:12',
    );
    const planCall = api.calls.find((c) => c.path === '/api/render/plan');
    expect(planCall.body.edl.tracks[0].clips.length).to.equal(1, 'the document on screen is sent');
  });

  it('asks the server again when the preset changes', async () => {
    const el = await fixture(`<export-dialog></export-dialog>`);
    el.open = true;
    await settle(200);
    const draft = el.querySelector('input[value="draft"]');
    draft.checked = true;
    draft.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(200);
    expect(el.querySelector('.export-dialog-facts').textContent).to.contain('960 × 540');
  });

  it('explains and blocks when the server cannot render the timeline', async () => {
    api.restore();
    api = mockApi({
      'GET /api/render/presets': { data: PRESETS },
      'POST /api/render/plan': [
        422,
        { error: 'Nothing to render', detail: 'The timeline has no clips' },
      ],
    });
    const el = await fixture(`<export-dialog></export-dialog>`);
    el.open = true;
    await settle(200);
    expect(el.querySelector('.export-dialog-blocked').textContent).to.contain('Nothing to render');
    expect(el.querySelector('.export-dialog-start').disabled).to.equal(true);
  });

  it('closes itself and says so', async () => {
    const el = await fixture(`<export-dialog></export-dialog>`);
    el.open = true;
    await settle(200);
    setTimeout(() => el.querySelector('.dialog-footer .btn-secondary').click());
    await oneEvent(el, 'close');
    await settle();
    expect(el.open).to.equal(false);
    expect(el.querySelector('app-dialog')).to.equal(null);
  });
});
