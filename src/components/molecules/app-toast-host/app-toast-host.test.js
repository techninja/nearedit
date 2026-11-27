import { fixture, expect } from '@open-wc/testing';
import { clearToasts, showToast } from '#utils/ui/toast.js';
import './app-toast-host.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

describe('app-toast-host', () => {
  beforeEach(() => clearToasts());

  it('shows queued toasts with their kind and text', async () => {
    const el = await fixture(`<app-toast-host></app-toast-host>`);
    showToast({ title: 'Render finished', detail: 'main.mp4 · 12 MB', kind: 'success' });
    showToast({ title: 'Analysis failed', kind: 'error' });
    await frame();
    const toasts = [...el.querySelectorAll('.toast')];
    expect(toasts.length).to.equal(2);
    expect(toasts[0].classList.contains('toast-success')).to.equal(true);
    expect(toasts[0].textContent).to.contain('Render finished');
    expect(toasts[0].textContent).to.contain('main.mp4 · 12 MB');
    expect(toasts[0].getAttribute('role')).to.equal('status');
    expect(toasts[1].getAttribute('role')).to.equal('alert');
  });

  it('removes a toast when its dismiss button is pressed', async () => {
    const el = await fixture(`<app-toast-host></app-toast-host>`);
    showToast({ title: 'One', timeout: 0 });
    showToast({ title: 'Two', timeout: 0 });
    await frame();
    el.querySelector('.toast [aria-label="Dismiss"]').click();
    await frame();
    const left = [...el.querySelectorAll('.toast')].map((t) => t.textContent.trim());
    expect(left.length).to.equal(1);
    expect(left[0]).to.contain('Two');
  });

  it('renders link and button actions, and dismisses when one is used', async () => {
    const el = await fixture(`<app-toast-host></app-toast-host>`);
    let ran = 0;
    showToast({
      title: 'Done',
      timeout: 0,
      actions: [
        { label: 'Download', href: '/api/render/file/a.mp4?download', download: true },
        { label: 'Open', href: '/api/render/file/a.mp4' },
        { label: 'Undo', run: () => ran++ },
      ],
    });
    await frame();
    const [download, open] = el.querySelectorAll('a.app-toast-action');
    expect(download.hasAttribute('download')).to.equal(true);
    expect(download.getAttribute('href')).to.equal('/api/render/file/a.mp4?download');
    expect(open.hasAttribute('download')).to.equal(false);
    expect(open.getAttribute('target')).to.equal('_blank');
    el.querySelector('button.app-toast-action').click();
    await frame();
    expect(ran).to.equal(1);
    expect(el.querySelectorAll('.toast').length).to.equal(0);
  });
});
