/**
 * What the page is loading right now, from the DevTools `Network` events:
 * the requests still in flight (the stepper's clock waits for them, up to a
 * limit), and the addresses the page itself was asked to show (so a refusal
 * by the gate can be told apart from a refused picture inside the page).
 * @module api/web/network
 */

/**
 * @typedef {Object} NetworkWatch
 * @property {Map<string, string>} inflight - Request id → address
 * @property {string[]} documents - Addresses of the page itself, oldest first
 * @property {() => number} idleFor - Milliseconds since anything started or finished
 * @property {() => void} touch - Count this moment as activity
 */

const MAX_DOCUMENTS = 50;

/**
 * @param {import('./cdp.js').Session} session - A page session with `Network` enabled
 * @param {() => string} mainFrame - The id of the page's main frame
 * @returns {NetworkWatch}
 */
export function watchNetwork(session, mainFrame) {
  /** @type {Map<string, string>} */
  const inflight = new Map();
  /** @type {string[]} */
  const documents = [];
  let last = Date.now();
  const touch = () => void (last = Date.now());

  session.on('Network.requestWillBeSent', ({ requestId, request, type, frameId }) => {
    touch();
    // Data and blob addresses never leave the browser and finish at once.
    if (!/^(data|blob|about):/i.test(request.url)) inflight.set(requestId, request.url);
    if (type === 'Document' && frameId === mainFrame()) {
      documents.push(request.url);
      if (documents.length > MAX_DOCUMENTS) documents.shift();
    }
  });
  const done = (/** @type {{ requestId: string }} */ { requestId }) => {
    touch();
    inflight.delete(requestId);
  };
  session.on('Network.loadingFinished', done);
  session.on('Network.loadingFailed', done);
  // A new page drops whatever the old one was still waiting for.
  session.on('Page.frameNavigated', ({ frame }) => {
    if (!frame.parentId) touch();
  });
  return { inflight, documents, idleFor: () => Date.now() - last, touch };
}
