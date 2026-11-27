import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { clearToasts, dismissToast, showError, showToast, toastState } from './toast.js';

const titles = () => toastState.get().toasts.map((toast) => toast.title);

describe('toasts', () => {
  beforeEach(() => {
    mock.timers.reset();
    mock.timers.enable({ apis: ['setTimeout'] });
    clearToasts();
  });

  it('shows a toast and removes it after its timeout', () => {
    showToast({ title: 'Saved' });
    assert.deepEqual(titles(), ['Saved']);
    mock.timers.tick(5999);
    assert.deepEqual(titles(), ['Saved']);
    mock.timers.tick(1);
    assert.deepEqual(titles(), []);
  });

  it('keeps errors longer than successes', () => {
    showToast({ title: 'ok', kind: 'success' });
    showToast({ title: 'bad', kind: 'error' });
    mock.timers.tick(6000);
    assert.deepEqual(titles(), ['bad']);
    mock.timers.tick(6000);
    assert.deepEqual(titles(), []);
  });

  it('gives toasts with actions twice the time', () => {
    showToast({
      title: 'Render finished',
      kind: 'success',
      actions: [{ label: 'Download', href: '/x' }],
    });
    mock.timers.tick(11999);
    assert.deepEqual(titles(), ['Render finished']);
    mock.timers.tick(1);
    assert.deepEqual(titles(), []);
  });

  it('keeps a toast with timeout 0 until dismissed', () => {
    const id = showToast({ title: 'Sticky', timeout: 0 });
    mock.timers.tick(60000);
    assert.deepEqual(titles(), ['Sticky']);
    dismissToast(id);
    assert.deepEqual(titles(), []);
  });

  it('shows at most four, dropping the oldest', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) showToast({ title: `t${n}` });
    assert.deepEqual(titles(), ['t3', 't4', 't5', 't6']);
  });

  it('builds an error toast from an ApiError-like object', () => {
    showError('Could not save', { message: 'Invalid edl', body: { detail: 'tracks[0] broken' } });
    const [toast] = toastState.get().toasts;
    assert.equal(toast.kind, 'error');
    assert.equal(toast.title, 'Could not save');
    assert.equal(toast.detail, 'Invalid edl — tracks[0] broken');
  });

  it('notifies subscribers on every change', () => {
    let calls = 0;
    const stop = toastState.subscribe(() => calls++);
    const id = showToast({ title: 'x' });
    dismissToast(id);
    stop();
    assert.equal(calls, 2);
  });
});
