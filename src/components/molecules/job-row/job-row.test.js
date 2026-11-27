import { fixture, expect, oneEvent } from '@open-wc/testing';
import './job-row.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const job = (extra = {}) => ({
  id: 'j1',
  type: 'render',
  status: 'running',
  projectId: 'p1',
  label: 'Render: Main Edit',
  progress: 42,
  error: '',
  log: ['Probing 3 source file(s)', 'Encoding 600 frames at 960x540'],
  result: {},
  ...extra,
});

async function mount(data) {
  const el = await fixture(`<job-row></job-row>`);
  el.job = data;
  await frame();
  return el;
}

describe('job-row', () => {
  it('shows a running job with its progress, last log line and a cancel button', async () => {
    const el = await mount(job());
    expect(el.querySelector('.job-row-label').textContent).to.equal('Render: Main Edit');
    expect(el.querySelector('.job-row-state').textContent).to.equal('42%');
    expect(el.querySelector('.job-row-log').textContent).to.contain('Encoding 600 frames');
    const bar = el.querySelector('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).to.equal('42');
    expect(el.querySelector('.progress-bar').style.width).to.equal('42%');
    expect(el.querySelector('.job-row-dismiss').getAttribute('aria-label')).to.equal(
      'Cancel Render: Main Edit',
    );
  });

  it('shows a waiting job without a percentage', async () => {
    const el = await mount(job({ status: 'queued', progress: 0, log: [] }));
    expect(el.querySelector('.job-row-state').textContent).to.equal('Waiting');
    expect(el.querySelector('.job-row-log')).to.equal(null);
  });

  it('shows the whole error of a failed job', async () => {
    const error = `ffmpeg exited with code 1: ${'filter graph is invalid '.repeat(20)}`;
    const el = await mount(job({ status: 'error', error, progress: 80 }));
    expect(el.querySelector('.job-row-message').textContent).to.equal(error);
    expect(el.querySelector('.job-row-message').getAttribute('role')).to.equal('alert');
    expect(el.querySelector('[role="progressbar"]')).to.equal(null);
    expect(el.querySelector('.job-row-dismiss').getAttribute('title')).to.equal('Dismiss');
  });

  it('offers download and open for a finished render', async () => {
    const result = { file: 'main.mp4', url: '/api/render/file/main.mp4' };
    const el = await mount(job({ status: 'complete', progress: 100, result }));
    const [download, open] = el.querySelectorAll('.job-row-links a');
    expect(download.getAttribute('href')).to.equal('/api/render/file/main.mp4?download');
    expect(download.hasAttribute('download')).to.equal(true);
    expect(open.getAttribute('target')).to.equal('_blank');
  });

  it('announces its button with the job', async () => {
    const el = await mount(job());
    setTimeout(() => el.querySelector('.job-row-dismiss').click());
    const event = await oneEvent(el, 'jobdismiss');
    expect(event.detail.job.id).to.equal('j1');
  });
});
