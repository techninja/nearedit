import { fixture, expect, oneEvent } from '@open-wc/testing';
import { settle } from '#utils/ui/testing/mockApi.js';
import './web-record-bar.js';

const READY = { status: 'ready', available: true, reason: '' };

async function mount(props) {
  const el = await fixture(`<web-record-bar></web-record-bar>`);
  Object.assign(el, { capture: READY, ...props });
  await settle();
  return el;
}

describe('web-record-bar', () => {
  it('says where the clip stands and offers to record it', async () => {
    const el = await mount({
      status: { state: 'unrecorded', text: 'Not recorded', action: 'Record' },
    });
    expect(el.querySelector('[role="status"]').textContent).to.equal('Not recorded');
    expect(el.querySelector('.web-record-bar-state').dataset.state).to.equal('unrecorded');
    expect(el.querySelector('.web-record-bar-go').textContent.trim()).to.equal('Record');
    expect(el.querySelector('[role="progressbar"]')).to.equal(null);
    setTimeout(() => el.querySelector('.web-record-bar-go').click());
    await oneEvent(el, 'web-record');
  });

  it('shows progress and a way to cancel while the browser records', async () => {
    const el = await mount({
      status: { state: 'recording', text: 'Recording 42 %', action: 'Record again' },
      recording: { status: 'running', progress: 42, message: '' },
    });
    const bar = el.querySelector('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).to.equal('42');
    expect(bar.querySelector('.progress-bar').style.width).to.equal('42%');
    expect(el.querySelector('.web-record-bar-go')).to.equal(null);
    setTimeout(() => el.querySelector('.btn').click());
    await oneEvent(el, 'web-cancel');
  });

  it('says why the last recording failed', async () => {
    const el = await mount({
      status: { state: 'stale', text: 'Out of date', action: 'Record again' },
      recording: { status: 'error', progress: 0, message: 'Step 2: nothing shows the text "Go"' },
    });
    expect(el.querySelector('[role="alert"]').textContent).to.contain('Step 2: nothing shows');
    expect(el.querySelector('.web-record-bar-go').textContent.trim()).to.equal('Record again');
  });

  it('lists what the recorder had to say about a recording that was made', async () => {
    const skipped = 'Step 2 (click): #buy is covered by <div#chat.bubble> "Talk to us"';
    const el = await mount({
      status: { state: 'recorded', text: 'Recorded 4.0 s · 2560×1440', action: 'Record again' },
      recording: { status: 'done', progress: 100, message: '', warnings: [skipped] },
    });
    const said = [...el.querySelectorAll('.web-record-bar-warnings li')].map(
      (li) => li.textContent,
    );
    expect(said).to.deep.equal([skipped]);
    expect(el.querySelector('[role="alert"]')).to.equal(null);
  });

  it('says when the server has no browser, and cannot record a clip on a locked track', async () => {
    const reason = 'No chrome-headless-shell was found. Run "npm run install-browser".';
    const el = await mount({
      status: { state: 'unrecorded', text: 'Not recorded', action: 'Record' },
      capture: { status: 'ready', available: false, reason },
      locked: true,
    });
    expect(el.querySelector('.web-record-bar-problem').textContent).to.contain(reason);
    expect(el.querySelector('.web-record-bar-go').disabled).to.equal(true);
  });
});
