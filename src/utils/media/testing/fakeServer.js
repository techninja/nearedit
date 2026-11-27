/**
 * A stand-in for the NearEdit server in browser component tests: answers
 * `fetch('/api/…')` from a route table and replaces the job WebSocket, so
 * panels can be mounted without a backend. Not part of the runtime —
 * import it from tests.
 * @module utils/media/testing/fakeServer
 */

/**
 * @typedef {(request: { url: URL, body: any }) => any} RouteHandler - Returns
 *   the JSON to answer with, or `[status, json]`
 */

/** A WebSocket that never connects anywhere; tests push messages into it. */
class FakeSocket extends EventTarget {
  /** @type {Set<FakeSocket>} */
  static open = new Set();

  constructor() {
    super();
    FakeSocket.open.add(this);
    queueMicrotask(() => this.dispatchEvent(new Event('open')));
  }

  /** Close the socket. */
  close() {
    FakeSocket.open.delete(this);
    this.dispatchEvent(new Event('close'));
  }
}

/**
 * Replace `fetch` and `WebSocket` until `restore()` is called.
 * @param {Record<string, RouteHandler|any>} routes - Keyed by
 *   `"METHOD /api/path"`; a plain value is returned as the JSON answer.
 *   Unknown routes answer 404
 * @returns {{ calls: { method: string, path: string, query: Record<string, string>, body: any }[],
 *   push: (message: any) => void, restore: () => void }} `calls` records
 *   every request; `push` delivers a server message (e.g. a `job_update`)
 */
export function installFakeServer(routes) {
  const realFetch = globalThis.fetch;
  const RealSocket = globalThis.WebSocket;
  /** @type {{ method: string, path: string, query: Record<string, string>, body: any }[]} */
  const calls = [];
  globalThis.fetch = /** @type {any} */ (
    async (/** @type {string} */ input, /** @type {RequestInit} */ init = {}) => {
      const url = new URL(input, location.href);
      if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
      const method = (init.method || 'GET').toUpperCase();
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
      const route = routes[`${method} ${url.pathname}`];
      const answer = typeof route === 'function' ? await route({ url, body }) : route;
      const [status, data] =
        route === undefined
          ? [404, { error: 'Not found' }]
          : Array.isArray(answer)
            ? answer
            : [200, answer];
      return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  );
  globalThis.WebSocket = /** @type {any} */ (FakeSocket);
  return {
    calls,
    push(message) {
      const event = () => new MessageEvent('message', { data: JSON.stringify(message) });
      for (const socket of FakeSocket.open) socket.dispatchEvent(event());
    },
    restore() {
      globalThis.fetch = realFetch;
      globalThis.WebSocket = RealSocket;
    },
  };
}

/**
 * Load the real stylesheets a component needs (the test page has no app shell).
 * @param {string[]} paths - Paths under `/src/`, e.g. `styles/tokens.css`
 * @returns {Promise<void[]>}
 */
export function loadStyles(paths) {
  return Promise.all(
    paths.map(
      (path) =>
        new Promise((resolve, reject) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = `/src/${path}`;
          link.onload = () => resolve(undefined);
          link.onerror = reject;
          document.head.append(link);
        }),
    ),
  );
}

/**
 * A MediaItem for tests.
 * @param {string} filename
 * @param {Record<string, any>} [extra]
 * @returns {any}
 */
export function mediaItem(filename, extra = {}) {
  const ext = filename.split('.').pop();
  const type = { mp4: 'video', mp3: 'audio', jpg: 'image', png: 'image', md: 'text' }[ext];
  const timed = type === 'video' || type === 'audio';
  return {
    filename,
    filePath: `/media/${filename}`,
    relativePath: filename,
    type,
    global: false,
    size: 1000,
    mtime: 1,
    duration: timed ? 10 : null,
    width: type === 'video' || type === 'image' ? 1280 : null,
    height: type === 'video' || type === 'image' ? 720 : null,
    fps: type === 'video' ? 30 : null,
    hasAudio: timed,
    rotation: 0,
    indexed: false,
    tags: [],
    analysis: { transcript: false, tags: false, beats: false, scenes: false, silences: false },
    ...extra,
  };
}
