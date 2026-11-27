/**
 * A tiny observable state container, and the hybrids property that mirrors
 * one. Page-level state (project lists, running jobs, the director form)
 * lives in containers like this instead of on routed views, whose writable
 * properties the router would serialise into the browser history.
 * @module utils/ui/observable
 */

/**
 * @template T
 * @typedef {Object} Observable
 * @property {() => T} get - Current state; a new object after every change
 * @property {(patch: Partial<T> | ((state: T) => Partial<T>)) => void} set - Shallow merge
 * @property {(listener: (state: T) => void) => () => void} subscribe
 */

/**
 * @template {Record<string, any>} T
 * @param {T} initial
 * @returns {Observable<T>}
 */
export function createObservable(initial) {
  let state = initial;
  /** @type {Set<(state: T) => void>} */
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const changes = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...changes };
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Hybrids property descriptor: a read-only property that always holds the
 * observable's current state and re-renders the component when it changes.
 * @template T
 * @param {{ get: () => T, subscribe: (listener: () => void) => () => void }} source
 * @returns {{ value: () => T, connect: (host: any, key: string, invalidate: () => void) => () => void }}
 */
export function watch(source) {
  return {
    value: () => source.get(),
    connect: (_host, _key, invalidate) => source.subscribe(() => invalidate()),
  };
}
