import { fixture, expect, oneEvent, waitUntil } from '@open-wc/testing';
import { fakeKitServer } from '#utils/brandUi/fakeKitServer.js';
import { builtinEntries } from '#utils/brandUi/kitList.js';
import { kitOf } from '#utils/brandUi/testkit.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './brand-kit-list.js';

const ACME = {
  ...{ id: 'acme', name: 'Acme', description: 'Ours', source: 'library', extends: 'builtin:bold' },
  ...{ key: 'k1', colors: { primary: '#22d3ee', text: '#ffffff' }, elements: 9, problems: 2 },
};

describe('brand-kit-list', () => {
  let net;
  beforeEach(() => {
    net = fakeKitServer({ library: { acme: { name: 'Acme', extends: 'builtin:bold' } } });
  });
  afterEach(() => net.restore());

  async function mount(props = {}) {
    const el = await fixture('<brand-kit-list style="display:block;width:900px"></brand-kit-list>');
    Object.assign(el, { kits: [...builtinEntries(), ACME], current: 'builtin:clean', ...props });
    await settle();
    return el;
  }

  it('reads a library kit from the server to draw its picture', async () => {
    const el = await mount();
    await waitUntil(() => el.querySelector('[data-id="acme"] brand-frame'));
    expect(net.calls.some((call) => call.path === '/api/kits/acme')).to.equal(true);
  });

  it('shows every kit by its name, its colours and a live picture; the one in use is marked', async () => {
    const el = await mount();
    const cards = [...el.querySelectorAll('.brand-kit-card')];
    expect(cards.map((card) => card.dataset.id)).to.deep.equal([
      'builtin:clean',
      'builtin:bold',
      'builtin:documentary',
      'builtin:playful',
      'acme',
    ]);
    expect(cards.map((card) => card.getAttribute('aria-pressed'))).to.deep.equal([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
    expect(cards[0].querySelector('.brand-kit-card-inuse').textContent).to.equal('In use');
    expect(cards[1].querySelector('strong').textContent).to.equal('Bold');
    expect(cards[1].querySelectorAll('.brand-swatches i').length).to.equal(5);
    expect(cards[1].querySelector('brand-frame canvas')).to.exist;
    expect(cards[4].querySelector('.brand-kit-card-problems').textContent).to.contain(
      '2 to look at',
    );
  });

  it('asks to choose the kit that was pressed', async () => {
    const el = await mount();
    setTimeout(() => el.querySelector('[data-id="builtin:playful"]').click());
    expect((await oneEvent(el, 'kit-choose')).detail).to.deep.equal({ id: 'builtin:playful' });
  });

  it('only a library kit can be removed', async () => {
    const el = await mount();
    const buttons = [...el.querySelectorAll('.brand-kit-card-remove')];
    expect(buttons.map((button) => button.dataset.id)).to.deep.equal(['acme']);
    expect(buttons[0].getAttribute('aria-label')).to.equal('Remove Acme from the library');
    setTimeout(() => buttons[0].click());
    expect((await oneEvent(el, 'kit-remove')).detail).to.deep.equal({ id: 'acme', name: 'Acme' });
  });

  it('lists the project’s own kit first, with or without its picture; waits while busy', async () => {
    const own = kitOf('bold');
    const el = await mount({
      current: 'project',
      own: { name: 'Mine', colors: own.tokens.color, kit: own },
      busy: true,
    });
    const first = el.querySelector('.brand-kit-card');
    expect([first.dataset.id, first.getAttribute('aria-pressed'), first.disabled]).to.deep.equal([
      'project',
      'true',
      true,
    ]);
    expect(first.querySelector('brand-frame')).to.exist;
    el.own = { name: 'Mine', colors: own.tokens.color, kit: null };
    el.current = 'acme';
    await waitUntil(() => el.querySelector('[data-id="project"] .brand-kit-card-blank'));
    expect(el.querySelector('[data-id="project"]').getAttribute('aria-pressed')).to.equal('false');
  });
});
