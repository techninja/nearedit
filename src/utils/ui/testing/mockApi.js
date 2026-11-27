/**
 * Canned API answers for browser component tests: replaces `fetch` so an
 * organism that loads from `/api/…` can be mounted without a server.
 * @module utils/ui/testing/mockApi
 */

/**
 * @typedef {any | ((body: any, url: URL) => any)} MockAnswer - JSON to answer with
 *   (status 200), a `[status, json]` pair, or a function returning either
 */

/**
 * Install the mock. Routes are keyed `"METHOD /api/path"` (no query string).
 * @param {Record<string, MockAnswer>} routes
 * @returns {{ calls: { method: string, path: string, query: Record<string, string>, body: any }[],
 *   restore: () => void }} `calls` records every request made
 */
export function mockApi(routes) {
  const original = globalThis.fetch;
  /** @type {ReturnType<typeof mockApi>['calls']} */
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), globalThis.location.href);
    const method = (init.method || 'GET').toUpperCase();
    if (!url.pathname.startsWith('/api/')) return original(input, init);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    const route = routes[`${method} ${url.pathname}`];
    let answer = typeof route === 'function' ? route(body, url) : route;
    if (answer === undefined) answer = [404, { error: `No mock for ${method} ${url.pathname}` }];
    const [status, json] =
      Array.isArray(answer) && typeof answer[0] === 'number' ? answer : [200, answer];
    const text = status === 204 || json === null ? null : JSON.stringify(json);
    return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

/** Wait for rendering and pending promises to settle. @param {number} [ms] @returns {Promise<void>} */
export const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
