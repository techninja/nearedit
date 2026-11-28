/**
 * A stand-in for the server's kit routes in tests: `fetch` answered from a
 * library and a project's kit kept in memory, resolved with the real brand
 * model — so a controller or a component can run without a server. Not
 * part of the runtime API — import it from tests.
 * @module utils/brandUi/fakeKitServer
 */

import { kitAnswer } from './testkit.js';

/**
 * Replace `fetch` with a kit server kept in memory.
 * @param {{ library?: Record<string, any>, choice?: string, own?: any, down?: boolean }} [start] -
 *   Library kits by id, the project's choice and own kit; `down`: every route answers 404
 * @returns {{ calls: { method: string, path: string, body: any }[], files: Record<string, string[]>,
 *   state: { choice: string, own: any, library: Record<string, any> }, restore: () => void }}
 */
export function fakeKitServer(start = {}) {
  const original = globalThis.fetch;
  const state = {
    choice: start.choice || 'builtin:clean',
    own: start.own || null,
    library: { ...start.library },
  };
  /** @type {Record<string, string[]>} */
  const files = {};
  /** @type {{ method: string, path: string, body: any }[]} */
  const calls = [];
  /** @type {(ref: string) => any} */
  const answer = (ref) => kitAnswer(state, files, ref);
  const project = () => ({ ...answer(state.choice), choice: state.choice });
  globalThis.fetch = /** @type {any} */ (
    async (/** @type {any} */ input, /** @type {any} */ init = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const method = (init.method || 'GET').toUpperCase();
      const path = decodeURIComponent(url.pathname);
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      calls.push({ method, path, body });
      const json = (/** @type {any} */ data, status = 200) =>
        new Response(data === null ? null : JSON.stringify(data), { status });
      // Anything that is not the API (icons, fonts) is none of this server's business.
      if (!path.startsWith('/api/')) return original(input, init);
      if (start.down) return json({ error: 'Not found' }, 404);
      const file = /^\/api\/(?:kits\/([^/]+)|projects\/[^/]+\/kit)\/files\/(.+)$/.exec(path);
      if (file && method === 'PUT') {
        const folder = file[1] || 'project';
        if (file[1] && !state.library[folder]) return json({ error: 'Kit not found' }, 404);
        files[folder] = [...new Set([...(files[folder] || []), file[2]])];
        return json({ name: file[2], size: 3 });
      }
      if (path === '/api/kits') {
        const ids = [
          ...['clean', 'bold', 'documentary', 'playful'].map((id) => `builtin:${id}`),
          ...Object.keys(state.library),
        ];
        return json({
          kits: ids.map((id) => {
            const a = answer(id);
            return {
              id,
              name: a.effective.name,
              description: '',
              source: a.source,
              extends: a.kit.extends || '',
              key: a.key,
              colors: a.effective.tokens.color,
              elements: 9,
              problems: 0,
            };
          }),
        });
      }
      const one = /^\/api\/kits\/([^/]+)$/.exec(path);
      if (one && method === 'PUT') {
        if (body.kit?.tokens?.color?.primary === 'nonsense')
          return json(
            {
              error: 'The kit does not validate',
              problems: [
                { path: 'tokens.color.primary', message: 'is not a usable color', level: 'error' },
              ],
            },
            422,
          );
        state.library[one[1]] = body.kit;
      }
      if (one && method === 'DELETE') return (delete state.library[one[1]], json(null, 204));
      if (one) return answer(one[1]) ? json(answer(one[1])) : json({ error: 'Kit not found' }, 404);
      if (/^\/api\/projects\/[^/]+\/kit$/.test(path)) {
        if (method === 'PUT' && body.kit)
          Object.assign(state, { own: body.kit, choice: 'project' });
        else if (method === 'PUT') {
          if (!answer(body.choice))
            return json(
              {
                error: 'No such kit',
                problems: [{ path: 'choice', message: 'There is no such kit', level: 'error' }],
              },
              422,
            );
          state.choice = body.choice;
        }
        return json(project());
      }
      return json({ error: 'Not found' }, 404);
    }
  );
  return { calls, files, state, restore: () => void (globalThis.fetch = original) };
}
