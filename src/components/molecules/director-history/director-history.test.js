import { fixture, expect } from '@open-wc/testing';
import './director-history.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const run = (id, extra = {}) => ({
  id,
  title: 'Base edit',
  where: 'Replace the timeline',
  summary: '6 clips, 20s',
  notes: ['Style auto → montage', '5 cuts land on the beat'],
  time: Date.now(),
  undone: false,
  kind: 'undo',
  ...extra,
});

async function mount(runs) {
  const el = await fixture(`<director-history></director-history>`);
  el.runs = runs;
  await frame();
  return el;
}

describe('director-history', () => {
  it('renders nothing without runs', async () => {
    const el = await mount([]);
    expect(el.querySelector('.director-history')).to.equal(null);
  });

  it('shows what each run did, with its notes', async () => {
    const el = await mount([run(2), run(1, { kind: 'revert', notes: [] })]);
    const items = [...el.querySelectorAll('.director-history-run')];
    expect(items.length).to.equal(2);
    expect(items[0].textContent).to.contain('Base edit');
    expect(items[0].textContent).to.contain('Replace the timeline');
    expect(items[0].querySelector('.director-history-summary').textContent).to.equal(
      '6 clips, 20s',
    );
    expect(items[0].querySelector('details').open).to.equal(true, 'latest run shows its notes');
    expect(items[0].querySelectorAll('.director-history-notes li').length).to.equal(2);
    expect(items[1].querySelector('details')).to.equal(null);
  });

  it('labels the way back by what it does', async () => {
    const el = await mount([
      run(3),
      run(2, { kind: 'revert' }),
      run(1, { kind: 'none', undone: true }),
    ]);
    const buttons = [...el.querySelectorAll('.director-history-run')].map(
      (item) => item.querySelector('.director-history-undo')?.textContent.trim() || '',
    );
    expect(buttons).to.deep.equal(['Undo this', 'Restore before', '']);
    expect(el.querySelectorAll('.director-history-undone').length).to.equal(1);
  });

  it('announces which run to take back', async () => {
    const el = await mount([run(7)]);
    const seen = [];
    el.addEventListener('runundo', (event) => seen.push(event.detail.id));
    el.querySelector('.director-history-undo').click();
    expect(seen).to.deep.equal([7]);
  });
});
