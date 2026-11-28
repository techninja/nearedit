import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import ViewState from '#store/ViewState.js';
import { kitKey } from '#utils/brand/index.js';
import * as session from '#utils/editor/session.js';
import { BRAND_COMMANDS, hasStaleElements } from './commands.js';
import { fakeKitServer } from './fakeKitServer.js';
import { loadProjectKit, watchProjectKit } from './kitLoad.js';
import { FALLBACK_KIT, acceptKit, currentKit, kitSettled, kitState, standIn } from './kitState.js';
import { OWN_KITS_KEY, ownKitOf } from './ownKit.js';
import { staleInfo, staleReason, updateToBrand } from './stale.js';
import { elementDoc, kitOf } from './testkit.js';

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
let net = { calls: [], restore: () => {} };
const stored = new Map();
globalThis.localStorage = /** @type {any} */ ({
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
});

beforeEach(async () => {
  kitState.set(standIn('', 'fallback'));
  stored.clear();
  await store.set(ViewState, { selection: [] });
});
afterEach(() => net.restore());

describe('the project’s kit', () => {
  it('is the built-in clean kit until a project’s has been read', () => {
    assert.equal(currentKit(), FALLBACK_KIT);
    assert.equal(kitState.get().choice, 'builtin:clean');
    assert.equal(kitSettled(), false);
  });

  it('is read from the server: the kit of the open adaptation', async () => {
    net = fakeKitServer({ choice: 'builtin:bold' });
    assert.equal(await loadProjectKit('p1', 'a1'), true);
    const state = kitState.get();
    assert.deepEqual(
      [state.status, state.choice, state.effective.name],
      ['ready', 'builtin:bold', 'Bold'],
    );
    assert.equal(state.key, kitKey(state.effective));
    assert.equal(net.calls[0].path, '/api/projects/p1/kit');
    assert.equal(kitSettled(), true);
  });

  it('falls back to clean, and says why, when the server has no kit routes', async () => {
    net = fakeKitServer({ down: true });
    assert.equal(await loadProjectKit('p1'), false);
    const state = kitState.get();
    assert.deepEqual(
      [state.status, state.effective, state.projectId],
      ['fallback', FALLBACK_KIT, 'p1'],
    );
    assert.match(state.error, /Not found/);
    assert.equal(kitSettled(), true, 'the built-in kit is then the one in force');
  });

  it('does not take an answer that is not a kit', () => {
    assert.equal(acceptKit('p1', { effective: { tokens: {} } }), false);
    assert.equal(acceptKit('p1', null), false);
    assert.equal(currentKit(), FALLBACK_KIT);
  });

  it('notes a project’s own kit so it can be offered again', async () => {
    net = fakeKitServer({ choice: 'project', own: { name: 'Mine', extends: 'builtin:bold' } });
    await loadProjectKit('p1');
    assert.equal(ownKitOf('p1').name, 'Mine');
    assert.ok(stored.has(OWN_KITS_KEY));
    assert.equal(ownKitOf('p2'), null);
  });

  it('follows the open project', async () => {
    net = fakeKitServer({ choice: 'builtin:playful' });
    const stop = watchProjectKit();
    await store.set(ProjectState, { projectId: 'p9', adaptationId: 'a2', loaded: true });
    await tick(20);
    assert.equal(kitState.get().effective.name, 'Playful');
    assert.equal(kitState.get().adaptationId, 'a2');
    await store.set(ProjectState, { loaded: false });
    await tick(20);
    assert.deepEqual([kitState.get().projectId, currentKit()], ['', FALLBACK_KIT]);
    stop();
  });
});

describe('out of date', () => {
  it('nothing is called out of date before the project’s kit is known', () => {
    const { doc } = elementDoc([['lower-third', { name: 'Ada' }, 1]], kitOf('bold'));
    assert.equal(staleInfo(doc).outdated.length, 0);
    kitState.set(standIn('p1', 'loading'));
    assert.equal(staleInfo(doc).outdated.length, 0);
    kitState.set(standIn('p1', 'fallback'));
    assert.equal(staleInfo(doc).outdated.length, 1);
  });

  it('tells outdated, locked and missing clips apart', () => {
    const bold = kitOf('bold');
    const { doc, clipIds } = elementDoc(
      [
        ['lower-third', { name: 'Ada' }, 1],
        ['title', { title: 'T' }, 9],
      ],
      bold,
    );
    const { title: _title, ...elements } = bold.elements;
    const without = { ...bold, elements };
    assert.deepEqual(staleInfo(doc, bold).outdated, []);
    const clean = kitOf('clean');
    const info = staleInfo(doc, clean);
    assert.deepEqual(info.outdated, clipIds);
    assert.equal(staleInfo(doc, clean), info, 'kept per document and kit');
    assert.deepEqual(staleInfo(doc, without).missing, [clipIds[1]]);
    const locked = { ...doc, tracks: doc.tracks.map((t) => ({ ...t, locked: true })) };
    assert.deepEqual(staleInfo(locked, kitOf('clean')).locked, clipIds);
  });

  it('“Update to brand” restyles what is asked, as one undo step', () => {
    const { doc, clipIds } = elementDoc(
      [
        ['lower-third', { name: 'Ada' }, 1],
        ['title', { title: 'T' }, 9],
      ],
      kitOf('bold'),
    );
    session.loadDoc(doc);
    kitState.set(standIn('p1', 'fallback'));
    assert.equal(hasStaleElements(), true);
    assert.equal(staleReason(clipIds[0]), 'outdated');
    assert.equal(updateToBrand([clipIds[0]]), 1);
    assert.deepEqual(staleInfo().outdated, [clipIds[1]]);
    const all = BRAND_COMMANDS.find((command) => command.id === 'brand.updateAll');
    assert.equal(all.label, 'Update all elements to brand');
    assert.equal(all.run(), true);
    assert.equal(all.enabled(), false);
    assert.equal(session.undo() && session.undo() && !session.undo(), true, 'two steps in all');
    assert.equal(updateToBrand([]), 0);
  });
});
