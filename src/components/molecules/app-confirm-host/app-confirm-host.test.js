import { fixture, expect } from '@open-wc/testing';
import { confirmAction } from '#utils/ui/confirm.js';
import './app-confirm-host.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

describe('app-confirm-host', () => {
  it('shows nothing until a question is asked', async () => {
    const el = await fixture(`<app-confirm-host></app-confirm-host>`);
    await frame();
    expect(el.querySelector('app-dialog')).to.equal(null);
  });

  it('asks, and resolves true on confirm', async () => {
    const el = await fixture(`<app-confirm-host></app-confirm-host>`);
    const answer = confirmAction({
      title: 'Replace the timeline?',
      message: 'Everything on unlocked tracks is replaced.',
      confirmLabel: 'Replace',
    });
    await frame();
    await frame();
    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-label')).to.equal('Replace the timeline?');
    expect(dialog.textContent).to.contain('Everything on unlocked tracks is replaced.');
    const yes = el.querySelector('.app-confirm-yes');
    expect(yes.textContent.trim()).to.equal('Replace');
    expect(document.activeElement).to.equal(yes);
    yes.click();
    expect(await answer).to.equal(true);
    await frame();
    expect(el.querySelector('app-dialog')).to.equal(null);
  });

  it('starts on Cancel for a destructive question and resolves false on Escape', async () => {
    const el = await fixture(`<app-confirm-host></app-confirm-host>`);
    const answer = confirmAction({ title: 'Delete?', danger: true, confirmLabel: 'Delete' });
    await frame();
    await frame();
    expect(document.activeElement.textContent.trim()).to.equal('Cancel');
    expect(el.querySelector('.app-confirm-yes').classList.contains('btn-danger')).to.equal(true);
    document.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(await answer).to.equal(false);
  });
});
