import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEdl } from './factory.js';
import { createHistory } from './history.js';
import { addMarker } from './markers.js';
import { deepFreeze } from './testkit.js';

describe('createHistory', () => {
  it('undoes and redoes by handing back the very same documents', () => {
    const history = createHistory();
    const a = deepFreeze(createEdl());
    history.push(a);
    const b = deepFreeze(addMarker(a, 1));
    history.push(b);
    const c = deepFreeze(addMarker(b, 2));

    assert.deepEqual(history.size(), { undo: 2, redo: 0 });
    assert.equal(history.undo(c), b);
    assert.equal(history.undo(b), a);
    assert.equal(history.undo(a), null, 'nothing left');
    assert.equal(history.canUndo(), false);
    assert.equal(history.redo(a), b);
    assert.equal(history.redo(b), c);
    assert.equal(history.redo(c), null);
    assert.equal(history.canRedo(), false);
    assert.equal(history.canUndo(), true);
  });

  it('a new edit clears the redo stack', () => {
    const history = createHistory();
    history.push('one');
    assert.equal(history.undo('two'), 'one');
    assert.equal(history.canRedo(), true);
    history.push('one');
    assert.equal(history.canRedo(), false);
    assert.equal(history.undo('three'), 'one');
  });

  it('ignores a push of the state that is already on top (drags push every move)', () => {
    const history = createHistory();
    const doc = createEdl();
    history.push(doc);
    history.push(doc);
    history.push(doc);
    assert.deepEqual(history.size(), { undo: 1, redo: 0 });
  });

  it('keeps at most `limit` undo steps, dropping the oldest', () => {
    const history = createHistory({ limit: 3 });
    for (const state of [1, 2, 3, 4, 5]) history.push(state);
    assert.deepEqual(history.size(), { undo: 3, redo: 0 });
    assert.deepEqual([history.undo(6), history.undo(5), history.undo(4), history.undo(3)], [5, 4, 3, null]);
    // The limit also holds while redoing.
    assert.deepEqual([history.redo(3), history.redo(4), history.redo(5)], [4, 5, 6]);
    assert.deepEqual(history.size(), { undo: 3, redo: 0 });
    assert.equal(createHistory({ limit: 0 }).size().undo, 0);
  });

  it('clear forgets everything; instances are independent', () => {
    const one = createHistory();
    const two = createHistory();
    one.push('x');
    one.undo('y');
    one.push('z');
    assert.equal(two.canUndo(), false);
    one.clear();
    assert.deepEqual(one.size(), { undo: 0, redo: 0 });
    assert.equal(one.undo('q'), null);
  });

  it('never copies: a huge document costs one reference per step', () => {
    const history = createHistory();
    const doc = deepFreeze(createEdl());
    history.push(doc);
    assert.equal(history.undo(null), doc);
    assert.ok(Object.isFrozen(doc));
  });
});
