import { fixture, expect, oneEvent } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { mockApi, settle } from '#utils/ui/testing/mockApi.js';
import { ADDRESSES_KEY } from '#utils/webUi/address.js';
import { resetCaptureStatus } from '#utils/webUi/captureStatus.js';
import './web-create.js';

const READY = { available: true, browser: { path: '/b', version: 'Chrome/158' }, reason: '' };
const type = (el, text) => {
  const input = el.querySelector('input');
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
};

describe('web-create', () => {
  let api;
  beforeEach(async () => {
    localStorage.removeItem(ADDRESSES_KEY);
    resetCaptureStatus();
    await store.set(ProjectState, { projectId: 'p1' });
    api = mockApi({ 'GET /api/web/status': READY });
  });
  afterEach(() => api.restore());

  it('offers the four sizes, Desktop chosen, and says nothing when the server can record', async () => {
    const el = await fixture(`<web-create></web-create>`);
    await settle();
    const sizes = [...el.querySelectorAll('.web-create-size')];
    expect(sizes.map((b) => b.dataset.size)).to.deep.equal(['desktop', 'wide', 'tablet', 'phone']);
    expect(sizes.map((b) => b.getAttribute('aria-pressed'))).to.deep.equal([
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(sizes[3].textContent).to.contain('390 × 844');
    expect(el.querySelector('.web-create-capture')).to.equal(null);
  });

  it('says in the server’s words why it cannot record, and still lets a clip be added', async () => {
    api.restore();
    const reason = 'No chrome-headless-shell was found. Run "npm run install-browser".';
    api = mockApi({ 'GET /api/web/status': { available: false, reason, browser: {} } });
    const el = await fixture(`<web-create></web-create>`);
    await settle();
    expect(el.querySelector('.web-create-reason').textContent).to.equal(reason);
    expect(el.querySelector('.web-create-add').disabled).to.equal(false);
    el.querySelector('.web-create-capture .btn').click();
    await settle();
    expect(api.calls.map((call) => call.query)).to.deep.equal([{}, { fresh: '1' }]);
  });

  it('asks to add a clip of the address that was typed, in the chosen size', async () => {
    const el = await fixture(`<web-create></web-create>`);
    await settle();
    el.querySelector('[data-size="phone"]').click();
    type(el, 'example.com/pricing');
    setTimeout(() => el.querySelector('.web-create-add').click());
    const { detail } = await oneEvent(el, 'web-add');
    expect(detail).to.deep.equal({ address: 'https://example.com/pricing', sizeId: 'phone' });
    await settle();
    expect(el.querySelector('input').value).to.equal('');
  });

  it('adds on Enter, and keeps typing away from the editor’s shortcuts', async () => {
    const el = await fixture(`<div><web-create></web-create></div>`);
    await settle();
    let leaked = 0;
    el.addEventListener('keydown', () => (leaked += 1));
    const input = type(el, 'localhost:5173');
    setTimeout(() =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    const { detail } = await oneEvent(el, 'web-add');
    expect(detail.address).to.equal('http://localhost:5173');
    expect(leaked).to.equal(0);
  });

  it('says what is wrong with something that is not an address, and adds nothing', async () => {
    const el = await fixture(`<web-create></web-create>`);
    await settle();
    let asked = 0;
    el.addEventListener('web-add', () => (asked += 1));
    type(el, 'not a site');
    el.querySelector('.web-create-add').click();
    await settle();
    expect(el.querySelector('[role="alert"]').textContent).to.contain('not a web address');
    expect(el.querySelector('input').getAttribute('aria-invalid')).to.equal('true');
    expect(asked).to.equal(0);
    type(el, 'example.com');
    await settle();
    expect(el.querySelector('[role="alert"]')).to.equal(null);
  });

  it('lists the addresses used last in this project; pressing one fills the box', async () => {
    localStorage.setItem(
      ADDRESSES_KEY,
      JSON.stringify({
        p1: ['https://a.example/x', 'http://localhost:3000'],
        other: ['https://b'],
      }),
    );
    const el = await fixture(`<web-create></web-create>`);
    await settle();
    const recent = [...el.querySelectorAll('.web-create-recent button')];
    expect(recent.map((b) => b.textContent.trim())).to.deep.equal([
      'a.example/x',
      'localhost:3000',
    ]);
    recent[1].click();
    await settle();
    expect(el.querySelector('input').value).to.equal('http://localhost:3000');
  });
});
