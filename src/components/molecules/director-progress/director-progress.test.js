import { fixture, expect } from '@open-wc/testing';
import './director-progress.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

describe('director-progress', () => {
  it('shows the progress and the job’s log lines', async () => {
    const el = await fixture(`<director-progress></director-progress>`);
    el.run = {
      title: 'Generate edit',
      progress: 37.4,
      log: ['8 media files (7 analysed)', 'Asking qwen3 for an edit plan…'],
      cancelling: false,
    };
    await frame();
    expect(el.querySelector('strong').textContent).to.equal('Generate edit — working… 37%');
    expect(el.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).to.equal('37');
    const lines = [...el.querySelectorAll('.director-progress-log li')].map((li) => li.textContent);
    expect(lines).to.deep.equal(['8 media files (7 analysed)', 'Asking qwen3 for an edit plan…']);
  });

  it('announces cancel and shows that it is cancelling', async () => {
    const el = await fixture(`<director-progress></director-progress>`);
    el.run = { title: 'Generate edit', progress: 10, log: [], cancelling: false };
    await frame();
    let cancels = 0;
    el.addEventListener('runcancel', () => cancels++);
    el.querySelector('button').click();
    expect(cancels).to.equal(1);
    el.run = { ...el.run, cancelling: true };
    await frame();
    expect(el.querySelector('strong').textContent).to.equal('Cancelling…');
    expect(el.querySelector('button').disabled).to.equal(true);
  });
});
