import { fixture, expect } from '@open-wc/testing';
import { store } from 'hybrids';
import UserPrefs, { USER_PREFS_KEY } from '#store/UserPrefs.js';
import { jobState } from '#utils/ui/jobCenter.js';
import './job-tray.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const job = (id, extra = {}) => ({
  id,
  type: 'render',
  status: 'running',
  projectId: 'p1',
  label: `Render ${id}`,
  progress: 10,
  error: '',
  log: [],
  createdAt: 1,
  updatedAt: 1,
  result: {},
  ...extra,
});

const RealNotification = window.Notification;
function fakePermission(permission) {
  window.Notification = /** @type {any} */ ({
    permission,
    requestPermission: async () => permission,
  });
}

describe('job-tray', () => {
  beforeEach(() => {
    localStorage.removeItem(USER_PREFS_KEY);
    store.clear(UserPrefs);
    jobState.set({ jobs: [] });
  });
  afterEach(() => {
    window.Notification = RealNotification;
  });

  it('shows how many jobs of its project are running', async () => {
    const el = await fixture(`<job-tray project-id="p1"></job-tray>`);
    jobState.set({
      jobs: [job('a'), job('b', { status: 'complete' }), job('other', { projectId: 'p2' })],
    });
    await frame();
    const button = el.querySelector('.job-tray-button');
    expect(el.querySelector('.job-tray-count').textContent).to.equal('1');
    expect(button.getAttribute('aria-label')).to.equal('Jobs: 1 running');
    expect(button.getAttribute('aria-expanded')).to.equal('false');
  });

  it('opens a list of the running and recent jobs, hiding housekeeping', async () => {
    const el = await fixture(`<job-tray project-id="p1"></job-tray>`);
    jobState.set({
      jobs: [job('a'), job('b', { status: 'complete' }), job('w', { type: 'waveform' })],
    });
    el.querySelector('.job-tray-button').click();
    await frame();
    await frame();
    const labels = [...el.querySelectorAll('job-row .job-row-label')].map((n) => n.textContent);
    expect(labels).to.deep.equal(['Render a', 'Render b']);
    expect(el.querySelector('.job-tray-clear')).to.not.equal(null);
  });

  it('says so when nothing is running, and closes on Escape', async () => {
    const el = await fixture(`<job-tray></job-tray>`);
    el.querySelector('.job-tray-button').click();
    await frame();
    expect(el.querySelector('.empty-state').textContent).to.contain('Nothing running');
    el.querySelector('.job-tray-button').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await frame();
    expect(el.querySelector('.job-tray-panel')).to.equal(null);
  });

  it('reflects the notification permission on its bell', async () => {
    fakePermission('denied');
    const el = await fixture(`<job-tray></job-tray>`);
    el.querySelector('.job-tray-button').click();
    await frame();
    const bell = el.querySelector('.job-tray-bell');
    expect(bell.disabled).to.equal(true);
    expect(bell.title).to.contain('blocked');
  });

  it('turns notifications off and on from the bell when permission is granted', async () => {
    fakePermission('granted');
    const el = await fixture(`<job-tray></job-tray>`);
    el.querySelector('.job-tray-button').click();
    await frame();
    expect(el.querySelector('.job-tray-bell').getAttribute('aria-pressed')).to.equal('true');
    el.querySelector('.job-tray-bell').click();
    await frame();
    await frame();
    expect(el.querySelector('.job-tray-bell').getAttribute('aria-pressed')).to.equal('false');
    expect(JSON.parse(localStorage.getItem(USER_PREFS_KEY)).notifications).to.equal('off');
    el.querySelector('.job-tray-bell').click();
    await frame();
    await frame();
    expect(el.querySelector('.job-tray-bell').getAttribute('aria-pressed')).to.equal('true');
  });
});
