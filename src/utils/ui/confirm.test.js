import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { answerConfirm, confirmAction, confirmState } from './confirm.js';

describe('confirmAction', () => {
  it('resolves true when confirmed and clears the request', async () => {
    const answer = confirmAction({ title: 'Delete?', danger: true });
    const { request } = confirmState.get();
    assert.equal(request.title, 'Delete?');
    assert.equal(request.danger, true);
    assert.equal(request.confirmLabel, 'OK');
    assert.equal(request.cancelLabel, 'Cancel');
    answerConfirm(true);
    assert.equal(await answer, true);
    assert.equal(confirmState.get().request, null);
  });

  it('resolves false when cancelled', async () => {
    const answer = confirmAction({ title: 'Replace?', confirmLabel: 'Replace' });
    assert.equal(confirmState.get().request.confirmLabel, 'Replace');
    answerConfirm(false);
    assert.equal(await answer, false);
  });

  it('asks one question at a time, in order', async () => {
    const first = confirmAction({ title: 'One' });
    const second = confirmAction({ title: 'Two' });
    assert.equal(confirmState.get().request.title, 'One');
    answerConfirm(false);
    assert.equal(confirmState.get().request.title, 'Two');
    answerConfirm(true);
    assert.deepEqual(await Promise.all([first, second]), [false, true]);
    assert.equal(confirmState.get().request, null);
  });

  it('ignores an answer when nothing is asked', () => {
    answerConfirm(true);
    assert.equal(confirmState.get().request, null);
  });
});
