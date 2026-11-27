import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createObservable, watch } from './observable.js';

describe('createObservable', () => {
  it('merges patches into a new state object', () => {
    const box = createObservable({ a: 1, b: 2 });
    const before = box.get();
    box.set({ b: 3 });
    assert.deepEqual(box.get(), { a: 1, b: 3 });
    assert.notEqual(box.get(), before, 'a change yields a new reference');
    assert.deepEqual(before, { a: 1, b: 2 }, 'the old state is untouched');
  });

  it('accepts an updater function', () => {
    const box = createObservable({ n: 1 });
    box.set((state) => ({ n: state.n + 1 }));
    assert.equal(box.get().n, 2);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const box = createObservable({ n: 0 });
    const seen = [];
    const stop = box.subscribe((state) => seen.push(state.n));
    box.set({ n: 1 });
    stop();
    box.set({ n: 2 });
    assert.deepEqual(seen, [1]);
  });

  it('lets a listener unsubscribe while being notified', () => {
    const box = createObservable({ n: 0 });
    let calls = 0;
    const stop = box.subscribe(() => {
      calls++;
      stop();
    });
    box.subscribe(() => calls++);
    box.set({ n: 1 });
    assert.equal(calls, 2);
  });
});

describe('watch', () => {
  it('reads the current state and invalidates on change', () => {
    const box = createObservable({ n: 0 });
    const descriptor = watch(box);
    let invalidated = 0;
    const disconnect = descriptor.connect(null, 'state', () => invalidated++);
    assert.equal(descriptor.value().n, 0);
    box.set({ n: 5 });
    assert.equal(invalidated, 1);
    assert.equal(descriptor.value().n, 5);
    disconnect();
    box.set({ n: 6 });
    assert.equal(invalidated, 1);
  });

  it('is read-only for hybrids (a getter of length 0)', () => {
    assert.equal(watch(createObservable({})).value.length, 0);
  });
});
