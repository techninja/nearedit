import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { brandDialog, closeBrandDialog, openBrandDialog } from '#utils/brandUi/dialogState.js';
import { draftState, endDraft } from '#utils/brandUi/draftState.js';
import { fakeKitServer } from '#utils/brandUi/fakeKitServer.js';
import { kitState, standIn } from '#utils/brandUi/kitState.js';
import { OWN_KITS_KEY } from '#utils/brandUi/ownKit.js';
import { staleInfo } from '#utils/brandUi/stale.js';
import { elementDoc, kitOf } from '#utils/brandUi/testkit.js';
import { getDoc, loadDoc } from '#utils/editor/session.js';
import { answerConfirm, confirmState } from '#utils/ui/confirm.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './brand-dialog.js';

describe('brand-dialog', () => {
  let net;
  let el;
  const q = (selector) => el.querySelector(selector);
  const press = (selector) => q(selector).click();

  async function mount(server = {}) {
    net = fakeKitServer(server);
    loadDoc(
      elementDoc(
        [
          ['lower-third', { name: 'Ada' }, 1],
          ['title', { title: 'T' }, 9],
        ],
        kitOf('clean'),
      ).doc,
    );
    kitState.set(standIn('', 'fallback'));
    // The dialog keeps the kit in step with the open project: open one.
    await store.set(ProjectState, { projectId: 'p1', adaptationId: '', loaded: true });
    el = await fixture('<brand-dialog></brand-dialog>');
    await waitUntil(() => kitState.get().projectId === 'p1' && kitState.get().status !== 'loading');
    openBrandDialog();
    await waitUntil(() => el.querySelectorAll('.brand-kit-card').length >= 4);
  }

  beforeEach(() => localStorage.removeItem(OWN_KITS_KEY));
  afterEach(async () => {
    endDraft();
    closeBrandDialog();
    await store.set(ProjectState, { projectId: '', loaded: false });
    net.restore();
  });

  it('renders nothing until it is opened, then lists the kits with the one in use marked', async () => {
    net = fakeKitServer();
    el = await fixture('<brand-dialog></brand-dialog>');
    expect(el.querySelector('app-dialog')).to.equal(null);
    await mount({ library: { acme: { name: 'Acme', extends: 'builtin:bold' } } });
    expect(q('.dialog').getAttribute('aria-label')).to.equal('Brand');
    expect([...el.querySelectorAll('.brand-kit-card')].map((c) => c.dataset.id)).to.include('acme');
    expect(q('.brand-kit-card[aria-pressed="true"]').dataset.id).to.equal('builtin:clean');
    await waitUntil(
      () => document.activeElement === q('.brand-kit-card[aria-pressed="true"]'),
      'focus is on the kit in use',
    );
  });

  it('one press chooses a kit; it says how many clips are out of date and updates only when asked', async () => {
    await mount();
    const before = getDoc();
    press('.brand-kit-card[data-id="builtin:bold"]');
    await waitUntil(() => kitState.get().choice === 'builtin:bold');
    expect(net.calls.at(-1)).to.deep.include({ method: 'PUT', path: '/api/projects/p1/kit' });
    await waitUntil(() => q('.brand-stale'));
    expect(q('.success-message').textContent).to.contain('Bold is now this project’s brand');
    expect(q('.brand-stale').textContent).to.contain('2 elements');
    expect(getDoc()).to.equal(before);
    press('.brand-stale-update');
    await waitUntil(() => !q('.brand-stale'));
    expect(staleInfo().outdated.length).to.equal(0);
    expect(q('.success-message').textContent).to.contain('Updated 2 elements to the brand');
  });

  it('customises: a token changes the live preview; saving writes the project’s own kit', async () => {
    await mount();
    press('[data-action="customise"]');
    await waitUntil(() => q('brand-token-editor'));
    expect(q('.dialog').getAttribute('aria-label')).to.equal('Brand — customise Clean');
    expect(q('[data-action="save"]').disabled).to.equal(true);
    const hex = q('field-color[name="color.primary"] .field-color-hex');
    hex.value = '#ff00ff';
    hex.dispatchEvent(new Event('change', { bubbles: true }));
    await waitUntil(() => q('brand-preview').kit.tokens.color.primary === '#ff00ff');
    expect(q('brand-preview').kit.tokens.color.onPrimary).to.equal('#000000');
    expect(draftState.get().draft.tokens).to.deep.equal({ color: { primary: '#ff00ff' } });
    await waitUntil(() => !q('[data-action="save"]').disabled);
    press('[data-action="save"]');
    await waitUntil(() => kitState.get().choice === 'project');
    expect(net.state.own).to.deep.include({ extends: 'builtin:clean', name: 'Clean, customised' });
    expect(net.state.own.tokens).to.deep.equal({ color: { primary: '#ff00ff' } });
    await waitUntil(() => q('.brand-stale'));
    expect(q('.brand-stale').textContent).to.contain('2 elements');
    press('[data-action="back"]');
    await waitUntil(() => q('.brand-kit-card[data-id="project"]'));
    expect(q('.brand-kit-card[data-id="project"]').getAttribute('aria-pressed')).to.equal('true');
  });

  it('“Save to library as…” asks for a name and makes a kit other projects can choose', async () => {
    await mount();
    press('[data-action="customise"]');
    await waitUntil(() => q('[data-action="save-as"]'));
    press('[data-action="save-as"]');
    await waitUntil(() => q('.brand-dialog-name'));
    expect(q('[data-action="save-library"]').disabled).to.equal(true);
    const name = q('.brand-dialog-name');
    name.value = 'Acme Studio';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await waitUntil(() => !q('[data-action="save-library"]').disabled);
    press('[data-action="save-library"]');
    await waitUntil(() => net.state.library['acme-studio']);
    expect(net.state.library['acme-studio']).to.deep.include({
      name: 'Acme Studio',
      extends: 'builtin:clean',
    });
    await waitUntil(() => q('.success-message'));
    expect(kitState.get().choice).to.equal('builtin:clean');
  });

  it('shows what is wrong when the server refuses a kit; asks before discarding changes', async () => {
    await mount();
    press('[data-action="customise"]');
    await waitUntil(() => q('brand-token-editor'));
    const style = q('input[data-name="sound.style"]');
    style.value = 'lofi';
    style.dispatchEvent(new Event('input', { bubbles: true }));
    await waitUntil(() => draftState.get().dirty);
    net.state.library = {};
    q('app-dialog').dispatchEvent(new CustomEvent('close', { detail: { reason: 'escape' } }));
    await waitUntil(() => confirmState.get().request);
    expect(confirmState.get().request.title).to.equal('Discard the changes to the brand?');
    answerConfirm(false);
    await settle();
    expect(brandDialog.get().open).to.equal(true);
    q('app-dialog').dispatchEvent(new CustomEvent('close', { detail: { reason: 'escape' } }));
    await waitUntil(() => confirmState.get().request);
    answerConfirm(true);
    await waitUntil(() => !brandDialog.get().open);
    expect(net.state.own).to.equal(null);
  });

  it('works without a server: the built-in kits are shown and it says so', async () => {
    await mount({ down: true });
    expect(kitState.get().status).to.equal('fallback');
    expect(q('.brand-dialog-offline').textContent).to.contain('The server gave no kits');
    press('.brand-kit-card[data-id="builtin:bold"]');
    await waitUntil(() => q('.error-message'));
    expect(q('.error-message').textContent).to.contain('Bold could not be chosen');
    expect(kitState.get().effective.name).to.equal('Clean');
  });
});
