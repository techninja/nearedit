import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { resetAvailability } from '#utils/cutoutUi/availability.js';
import { startCutouts } from '#utils/cutoutUi/runtime.js';
import { noteFile, resetCutoutJobs } from '#utils/cutoutUi/state.js';
import { SELFIE, cutoutDoc, madeFor } from '#utils/cutoutUi/testkit.js';
import { attachCutout, setCutout, toggleTrackLock } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { canUndo, edit, getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { inspectorModel } from '#utils/inspector/model.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import './cutout-inspector.js';

const NEED = { path: SELFIE, start: 3, end: 10, fps: 30 };
const REASON = 'No model at /data/models/modnet.onnx: npm run install-cutout';
const me = () => clipOf(getDoc(), 'me');
const running = { status: 'running', progress: 40, frame: 84, frames: 210, message: '' };

async function mount(selection = ['me']) {
  const el = await fixture(`<div><cutout-inspector></cutout-inspector></div>`);
  const group = el.querySelector('cutout-inspector');
  const show = async () => {
    group.model = inspectorModel(getDoc(), selection, 0);
    await settle();
  };
  await show();
  const button = (text) =>
    [...group.querySelectorAll('button')].find((b) => b.textContent.includes(text));
  const place = (id) => group.querySelector(`cutout-place[data-place="${id}"] button`);
  const toggle = () => group.querySelector('input[role="switch"]');
  return {
    el,
    group,
    show,
    button,
    place,
    toggle,
    status: () => group.querySelector('.cutout-inspector-text'),
  };
}

describe('cutout-inspector', () => {
  let api;
  let stop = () => {};
  let job = { status: 'running', progress: 40, log: ['frame 84 of 210'] };
  let server = { available: true, reason: '' };
  beforeEach(async () => {
    loadDoc(cutoutDoc());
    resetCutoutJobs();
    resetAvailability();
    job = { status: 'running', progress: 40, log: ['frame 84 of 210'] };
    server = { available: true, reason: '' };
    await store.set(ProjectState, { projectId: 'p1', adaptationId: 'a1' });
    api = mockApi({
      'GET /api/cutout/status': () => server,
      'GET /api/jobs': { data: [] },
      'POST /api/cutout': [202, { jobId: 'j1' }],
      'GET /api/jobs/j1': () => ({ id: 'j1', type: 'cutout', ...job }),
      'GET /api/jobs/j1/result': madeFor(NEED),
      'DELETE /api/jobs/j1': [204, null],
    });
  });
  afterEach(() => {
    stop();
    stop = () => {};
    api.restore();
  });

  it('shows for footage only', async () => {
    for (const id of ['photo', 'sound']) {
      const { group } = await mount([id]);
      expect(group.children.length, id).to.equal(0);
    }
    const { group, toggle } = await mount(['me']);
    expect(group.querySelector('.field-group-title').textContent).to.contain('Cut out person');
    expect(toggle().checked).to.equal(false);
    expect(group.querySelector('.cutout-inspector-hint').textContent).to.contain(
      'Keeps only the person',
    );
    expect(group.querySelector('cutout-place')).to.equal(null);
  });

  it('switches the cutout on as one undo step, and off again', async () => {
    const { show, toggle, status, group } = await mount();
    toggle().click();
    await show();
    expect(me().cutout.on).to.equal(true);
    expect(toggle().checked).to.equal(true);
    expect(status().textContent).to.equal('Starting…');
    expect(group.querySelectorAll('cutout-place').length).to.equal(7);
    undo();
    expect(me().cutout).to.equal(undefined);
    expect(canUndo()).to.equal(false);
  });

  it('follows the job: progress with a cancel, then ready', async () => {
    edit((doc) => setCutout(doc, ['me'], true));
    const { show, status, button, group } = await mount();
    noteFile(SELFIE, { ...running, start: 3, end: 10 });
    await settle();
    expect(status().textContent).to.equal('Making the cutout — frame 84 of 210');
    const bar = group.querySelector('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).to.equal('40');
    expect(bar.querySelector('.progress-bar').style.width).to.equal('40%');
    expect(button('Cancel')).to.not.equal(undefined);
    edit((doc) => attachCutout(doc, madeFor(NEED)));
    noteFile(SELFIE, null);
    await show();
    expect(status().textContent).to.equal('The person is cut out');
    expect(status().closest('[data-stage]').dataset.stage).to.equal('ready');
    expect(group.querySelector('[role="progressbar"]')).to.equal(null);
    expect(button('Cancel')).to.equal(undefined);
  });

  it('cancels a running job, and makes it after all', async () => {
    stop = startCutouts({ delay: 5 });
    const { show, toggle, status, button } = await mount();
    toggle().click();
    await show();
    await settle(150);
    expect(status().textContent).to.equal('Making the cutout — frame 84 of 210');
    button('Cancel').click();
    await settle(150);
    expect(api.calls.some((call) => call.method === 'DELETE')).to.equal(true);
    expect(status().textContent).to.contain('Cancelled');
    job = { status: 'complete', progress: 100 };
    button('Make it').click();
    await settle(250);
    await show();
    expect(status().textContent).to.equal('The person is cut out');
    expect(api.calls.filter((call) => call.method === 'POST').length).to.equal(2);
  });

  it('keeps a failure in view with a retry', async () => {
    edit((doc) => setCutout(doc, ['me'], true));
    const { status, button } = await mount();
    noteFile(SELFIE, { ...running, status: 'error', message: 'The matte program stopped' });
    await settle();
    expect(status().textContent).to.equal('Failed — The matte program stopped');
    expect(button('Try again')).to.not.equal(undefined);
  });

  it('explains what a server without a matte program is missing', async () => {
    server = { available: false, reason: REASON };
    stop = startCutouts({ delay: 5 });
    const { group, show, toggle, button, status } = await mount();
    await settle(100);
    const note = group.querySelector('.cutout-inspector-missing');
    expect(note.textContent).to.contain('This server cannot make cutouts yet');
    expect(note.querySelector('.cutout-inspector-reason').textContent).to.equal(REASON);
    expect(note.querySelector('code').textContent).to.equal('npm run install-cutout');
    expect(toggle().disabled).to.equal(false);
    toggle().click();
    await show();
    await settle(100);
    expect(status().textContent).to.equal('This server cannot make cutouts');
    expect(api.calls.some((call) => call.method === 'POST')).to.equal(false);
    server = { available: true, reason: '' };
    job = { status: 'complete', progress: 100 };
    button('Check again').click();
    await settle(300);
    await show();
    expect(api.calls.some((call) => call.query.fresh !== undefined)).to.equal(true);
    expect(group.querySelector('.cutout-inspector-missing')).to.equal(null);
    expect(status().textContent).to.equal('The person is cut out');
  });

  it('edits the settings of every selected clip and keeps the events to itself', async () => {
    edit((doc) => setCutout(doc, ['me', 'me2'], true));
    const { el, group, show, button } = await mount(['me', 'me2', 'photo']);
    let leaked = 0;
    el.addEventListener('field-change', () => leaked++);
    const softness = group.querySelector('field-number[name="cutout.feather"]');
    expect(softness.querySelector('.field-number-unit').textContent).to.equal('%');
    expect(group.querySelector('field-number[name="cutout.blur"]')).to.equal(null);
    const detail = { name: 'cutout.feather', value: 1.5, phase: 'commit' };
    softness.dispatchEvent(new CustomEvent('field-change', { detail, bubbles: true }));
    button('Blur').click();
    await show();
    expect(leaked).to.equal(0);
    for (const id of ['me', 'me2']) {
      const { feather, mode } = clipOf(getDoc(), id).cutout;
      expect([feather, mode], id).to.deep.equal([1.5, 'blur']);
    }
    expect(button('Blur').getAttribute('aria-pressed')).to.equal('true');
    expect(group.querySelector('field-number[name="cutout.blur"]').value).to.equal(3);
    expect(clipOf(getDoc(), 'photo').cutout).to.equal(undefined);
  });

  it('shows a mixed selection and switches all of it on', async () => {
    edit((doc) => setCutout(doc, ['me'], true));
    const { show, toggle } = await mount(['me', 'me2']);
    expect([toggle().checked, toggle().indeterminate]).to.deep.equal([false, true]);
    toggle().click();
    await show();
    expect(clipOf(getDoc(), 'me2').cutout.on).to.equal(true);
    expect([toggle().checked, toggle().indeterminate]).to.deep.equal([true, false]);
  });

  it('places the person with one click, and adds a shadow and an outline', async () => {
    edit((doc) => setCutout(doc, ['me'], true));
    const { show, place, button } = await mount();
    expect(place('fill').getAttribute('aria-pressed')).to.equal('true');
    place('circle-left').click();
    await show();
    const { transform, effects } = me();
    expect([transform.fit, transform.scaleX]).to.deep.equal(['contain', 0.3]);
    expect(effects.map((fx) => fx.type)).to.deep.equal(['mask']);
    expect(place('circle-left').getAttribute('aria-pressed')).to.equal('true');
    expect(place('fill').getAttribute('aria-pressed')).to.equal('false');
    button('Shadow').click();
    await show();
    button('Outline').click();
    await show();
    expect(me().effects.map((fx) => fx.type)).to.deep.equal(['mask', 'outline', 'dropShadow']);
    expect(button('Shadow').getAttribute('aria-pressed')).to.equal('true');
    button('Shadow').click();
    await show();
    expect(me().effects.map((fx) => fx.type)).to.deep.equal(['mask', 'outline']);
    undo();
    undo();
    undo();
    undo();
    expect(me().effects.length).to.equal(0);
    expect(me().transform.fit).to.equal('cover');
  });

  it('cannot be changed on a locked track', async () => {
    edit((doc) => toggleTrackLock(setCutout(doc, ['me'], true), 'v1'));
    const { group, toggle, place, button } = await mount();
    expect(toggle().disabled).to.equal(true);
    expect(place('left').disabled).to.equal(true);
    expect(button('Shadow').disabled).to.equal(true);
    expect(group.querySelector('.seg button').disabled).to.equal(true);
  });
});
