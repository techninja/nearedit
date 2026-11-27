import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRun, markUndone, syncHistory, undoKind } from './history.js';

const run = (id, before, after) => ({
  id,
  title: 'Base edit',
  where: '',
  summary: '',
  notes: [],
  time: id,
  before,
  after,
  undone: false,
});

describe('addRun', () => {
  it('puts the newest first and keeps the list short', () => {
    let history = [];
    for (let i = 1; i <= 12; i++) history = addRun(history, run(i, {}, {}));
    assert.equal(history.length, 8);
    assert.equal(history[0].id, 12);
    assert.equal(history[7].id, 5);
  });
});

describe('undoKind', () => {
  const before = { v: 1 };
  const after = { v: 2 };
  const record = run(1, before, after);

  it('is a plain undo while the result is still the current document', () => {
    assert.equal(undoKind(record, after), 'undo');
  });

  it('is a revert once the timeline has moved on', () => {
    assert.equal(undoKind(record, { v: 3 }), 'revert');
  });

  it('is nothing when already undone or back at the starting point', () => {
    assert.equal(undoKind({ ...record, undone: true }, { v: 3 }), 'none');
    assert.equal(undoKind(record, before), 'none');
  });
});

describe('markUndone / syncHistory', () => {
  const before = { v: 1 };
  const after = { v: 2 };

  it('marks one run', () => {
    const history = markUndone([run(1, before, after), run(2, {}, {})], 1);
    assert.deepEqual(
      history.map((r) => r.undone),
      [true, false],
    );
  });

  it('follows undo and redo done elsewhere (keyboard, header)', () => {
    const history = [run(1, before, after)];
    const undone = syncHistory(history, before);
    assert.equal(undone[0].undone, true);
    const redone = syncHistory(undone, after);
    assert.equal(redone[0].undone, false);
  });

  it('returns the same array when nothing changed', () => {
    const history = [run(1, before, after)];
    assert.equal(syncHistory(history, after), history);
    assert.equal(syncHistory(history, { v: 9 }), history);
  });
});
