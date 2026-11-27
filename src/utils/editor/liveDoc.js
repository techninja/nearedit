/**
 * The open document as a component property.
 *
 * The edit session holds the document; `TimelineState` only signals that it
 * changed. A component that draws tracks, clips or markers declares
 * `doc: liveDoc()` and reads `doc` in its render. Event handlers and
 * anything outside a render call `getDoc()` directly: the property is as
 * old as the last signal, which during a drag trails the session by up to
 * a frame.
 * @module utils/editor/liveDoc
 */

import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { getDoc } from '#utils/editor/session.js';

/**
 * Hybrids property descriptor: a read-only property that holds the
 * session's document as of the last change signal and re-renders the
 * component when the next one arrives. Never mutate what it holds.
 * @returns {{ value: () => any }}
 */
export function liveDoc() {
  return {
    value: () => {
      // Reading the signal is the subscription: hybrids recomputes a
      // property when a store model it read while computing is replaced.
      store.get(TimelineState);
      return getDoc();
    },
  };
}
