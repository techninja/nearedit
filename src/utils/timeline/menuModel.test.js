import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { SELFIE, cutoutDoc } from '#utils/cutoutUi/testkit.js';
import { insertWebClip, toggleTrackLock } from '#utils/edl/index.js';
import { newClipIds } from '#utils/edl/selection.js';
import { clipOf } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import { CLIP_MENU, WHERE_POSSIBLE } from './menuLists.js';
import { contextMenu } from './menuModel.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const CUTOUT = 'Cut out person';
const browser = { requestAnimationFrame: globalThis.requestAnimationFrame };

/**
 * The menu of a right-click on a clip: as the timeline does, a clip that is
 * not selected becomes the selection first.
 * @param {string} clipId
 * @param {string[]} [selection] - What is selected when it is not just the clip
 * @returns {Promise<import('./menuModel.js').MenuItem[]>}
 */
async function menuOn(clipId, selection = [clipId]) {
  await store.set(ViewState, { selection });
  return contextMenu(/** @type {any} */ ({ zone: 'lane', time: 1, clipId, part: 'body' }), {
    renameMarker: () => {},
    renameRegion: () => {},
  });
}
/** @param {import('./menuModel.js').MenuItem[]} items */
const labels = (items) => items.map((item) => (item.separator ? '-' : item.label));

// The cutout command shows the inspector: in a browser that waits two frames.
before(() => {
  globalThis.requestAnimationFrame = (run) => /** @type {any} */ (setTimeout(run, 0));
  Object.assign(globalThis, { document: { querySelector: () => null } });
});
after(async () => {
  for (let frame = 0; frame < 3; frame++) await tick(); // let the last frames run
  globalThis.requestAnimationFrame = browser.requestAnimationFrame;
  delete (/** @type {any} */ (globalThis).document);
});
beforeEach(() => session.loadDoc(cutoutDoc()));

describe('the clip menu and the person cutout', () => {
  it('lists the cutout beside the captions, among the commands that show only where they can act', () => {
    assert.deepEqual(WHERE_POSSIBLE, ['cutout.toggle']);
    const at = CLIP_MENU.indexOf('cutout.toggle');
    assert.deepEqual(CLIP_MENU.slice(at - 2, at + 2), [
      '-',
      'captions.toggle',
      'cutout.toggle',
      '-',
    ]);
  });

  it('offers it on footage, with its key, and switches it on and off from there', async () => {
    const items = await menuOn('me');
    const names = labels(items);
    assert.equal(names[names.indexOf(CUTOUT) - 1], 'Captions on / off');
    const item = items.find((entry) => entry.label === CUTOUT);
    assert.deepEqual(
      [item?.disabled, item?.checked, item?.shortcut],
      [false, false, 'Alt+P'],
      'ready to switch on',
    );
    item?.run?.();
    assert.equal(clipOf(session.getDoc(), 'me').cutout.on, true);
    const again = (await menuOn('me')).find((entry) => entry.label === CUTOUT);
    assert.equal(again?.checked, true, 'shown as on');
    again?.run?.();
    assert.equal(clipOf(session.getDoc(), 'me').cutout, undefined, 'switched off again');
    assert.equal(session.undo() && session.undo(), true, 'two undo steps, one each');
  });

  it('leaves it out for what cannot be cut out, and keeps the rest of the menu', async () => {
    const before = session.getDoc();
    session.edit((doc) => insertWebClip(doc, { url: 'https://example.com/', steps: [] }));
    const [web] = newClipIds(before, session.getDoc());
    for (const clipId of ['photo', 'sound', web]) {
      const names = labels(await menuOn(clipId));
      assert.equal(names.includes(CUTOUT), false, `${clipId} cannot be cut out`);
      assert.equal(names.includes('Captions on / off'), true, 'the captions stay, greyed or not');
      assert.equal(/-,-/.test(names.join()), false, 'no two dividing lines in a row');
    }
    assert.equal(clipOf(session.getDoc(), web).sourceFile === SELFIE, false);
  });

  it('follows the selection, as the command does', async () => {
    const names = labels(await menuOn('photo', ['photo', 'me2']));
    assert.equal(names.includes(CUTOUT), true, 'footage is selected with the still');
    (await menuOn('photo', ['photo', 'me2'])).find((entry) => entry.label === CUTOUT)?.run?.();
    assert.equal(clipOf(session.getDoc(), 'me2').cutout.on, true);
    assert.equal(clipOf(session.getDoc(), 'photo').cutout, undefined);
  });

  it('is not offered for footage on a locked track', async () => {
    session.edit((doc) => toggleTrackLock(doc, doc.tracks[0].trackId));
    assert.equal(labels(await menuOn('me')).includes(CUTOUT), false);
  });
});
