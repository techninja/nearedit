/**
 * Fixtures for tests of the web editor's controllers: a document with a
 * web clip, a snapshot as the server sends it, and stand-ins for the
 * network (`fetch`, the job socket) so a controller can run without a
 * server. Not part of the runtime API — import it from tests.
 * @module utils/webUi/testkit
 */

import { newClipIds } from '#utils/edl/selection.js';
import { testEdl } from '#utils/edl/testkit.js';
import { insertWebClip } from '#utils/edl/webClip.js';

/** The page every fixture is of. */
export const PAGE = 'https://example.com/';

/**
 * A document with one web clip.
 * @param {any[]} [steps]
 * @param {Record<string, any>} [recipe] - Other fields of the recipe
 * @returns {{ doc: any, clipId: string }}
 */
export function webDoc(steps = [], recipe = {}) {
  const empty = testEdl();
  const doc = insertWebClip(empty, { url: PAGE, steps, ...recipe }, { time: 0 });
  return { doc, clipId: newClipIds(empty, doc)[0] };
}

/**
 * A snapshot of a 1280 × 720 viewport at the top of a 2000 px page.
 * @param {Record<string, any>} [extra]
 * @returns {import('./pageMap.js').Snapshot}
 */
export function testSnapshot(extra = {}) {
  const element = (kind, name, target, x, y, width, height) => ({
    ...{ kind, name, target, visible: y < 720 },
    rect: { x, y, width, height },
  });
  return {
    url: PAGE,
    title: 'Example',
    viewport: { width: 1280, height: 720 },
    page: { width: 1280, height: 2000 },
    scrollY: 0,
    image: 'data:image/png;base64,iVBORw0KGgo=',
    elements: [
      element('section', 'Hero', '#hero', 0, 0, 1280, 600),
      element('button', 'Get started', 'text=Get started', 100, 300, 160, 40),
      element('link', 'Pricing', 'a[href="#pricing"]', 900, 20, 60, 20),
      element('section', 'Sign up', '#signup', 0, 1200, 1280, 500),
      element('input', 'Email', 'label=Email', 100, 1300, 300, 40),
    ],
    warnings: [],
    ...extra,
  };
}

/**
 * Replace `fetch` with canned answers. Routes are keyed `"METHOD /api/path"`;
 * an answer is JSON, a `[status, json]` pair, or a function of the body.
 * @param {Record<string, any>} routes
 * @returns {{ calls: { method: string, path: string, body: any }[], restore: () => void }}
 */
export function fakeFetch(routes) {
  const original = globalThis.fetch;
  /** @type {{ method: string, path: string, body: any }[]} */
  const calls = [];
  globalThis.fetch = /** @type {any} */ (
    async (/** @type {any} */ input, /** @type {any} */ init = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init.method || 'GET').toUpperCase();
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: url.pathname + url.search, body });
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const route = routes[`${method} ${url.pathname}`];
      let answer = typeof route === 'function' ? await route(body, url, init) : route;
      if (answer === undefined) answer = [404, { error: `No fake for ${method} ${url.pathname}` }];
      const [status, json] =
        Array.isArray(answer) && typeof answer[0] === 'number' ? answer : [200, answer];
      return new Response(JSON.stringify(json), { status });
    }
  );
  return { calls, restore: () => void (globalThis.fetch = original) };
}

/**
 * Give Node what the job client needs of a browser: a `location` and a
 * `WebSocket` that never says anything (jobs are then followed by polling).
 * @returns {() => void} Put things back
 */
export function fakeBrowser() {
  const before = { location: globalThis.location, WebSocket: globalThis.WebSocket };
  const quiet = class {
    /** Nothing ever arrives. */
    addEventListener() {}
    /** Nothing to close. */
    close() {}
  };
  Object.assign(globalThis, { location: { protocol: 'http:', host: 'localhost' } });
  Object.assign(globalThis, { WebSocket: quiet });
  return () => void Object.assign(globalThis, before);
}
