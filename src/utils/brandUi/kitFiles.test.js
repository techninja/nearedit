import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createImageCache } from '#utils/playback/imageCache.js';
import { pictureUrl } from '#utils/playback/mediaUrl.js';
import { brandDialog } from './dialogState.js';
import { chooseFile } from './draftEdits.js';
import { beginDraft, endDraft } from './draftState.js';
import { fakeKitServer } from './fakeKitServer.js';
import { pictureFiles, refreshPictures } from './kitFiles.js';
import { deleteKit, kitPictures, loadKits, pictureKit } from './kitList.js';
import { loadProjectKit } from './kitLoad.js';
import { kitState, standIn } from './kitState.js';
import { saveForProject, saveToLibrary } from './saveKit.js';

/** Every image the preview's cache asked for, by address. */
let asked = [];
class FakeImage {
  set src(address) {
    asked.push(address);
    this.naturalWidth = 64;
    queueMicrotask(() => this.onload());
  }
}
const file = (name) => new File(['abc'], name);
const settled = () => new Promise((done) => setTimeout(done, 0));
let net = { restore: () => {} };

/** A cache as the preview has one, holding the pictures at some paths. */
async function previewWith(paths) {
  const told = { count: 0 };
  const cache = createImageCache(() => told.count++);
  for (const path of paths) cache.get(pictureUrl(path));
  await settled();
  told.count = 0;
  asked = [];
  return { cache, told };
}

describe('a kit’s files and the preview', () => {
  before(() => void (globalThis.Image = /** @type {any} */ (FakeImage)));
  after(() => void delete globalThis.Image);
  afterEach(() => {
    net.restore();
    endDraft();
    kitState.set(standIn('', 'fallback'));
  });

  it('knows a kit’s pictures: its logos, each once', () => {
    const kit = { tokens: { logo: { main: '/k/logo.png', mark: '/k/logo.png', initials: 'AC' } } };
    assert.deepEqual(pictureFiles(kit), ['/k/logo.png']);
    assert.deepEqual(pictureFiles({ tokens: { logo: { main: '/k/a.png', mark: '/k/b.png' } } }), [
      '/k/a.png',
      '/k/b.png',
    ]);
    assert.deepEqual(pictureFiles({ tokens: {} }), []);
    assert.deepEqual(pictureFiles(null), []);
    // Only the files that changed, when they are named.
    const two = { tokens: { logo: { main: '/k/a.png', mark: 'C:\\kits\\b.png' } } };
    assert.deepEqual(refreshPictures(two, ['b.png', 'Font.ttf']), ['C:\\kits\\b.png']);
    assert.deepEqual(refreshPictures(two, []), []);
    assert.deepEqual(refreshPictures(two), ['/k/a.png', 'C:\\kits\\b.png']);
  });

  it('a logo saved again under its name is read afresh by the preview', async () => {
    net = fakeKitServer();
    await loadProjectKit('p1');
    await beginDraft();
    assert.equal(chooseFile('logo.main', file('logo.png')), true);
    assert.equal(await saveForProject(), true);
    const logo = kitState.get().effective.tokens.logo.mark;
    assert.equal(logo, '/kits/project/logo.png');
    // The preview draws a clip that shows it — and another picture.
    const { cache, told } = await previewWith([logo, '/media/photo.jpg']);
    const before = cache.get(pictureUrl(logo));
    const photo = cache.get(pictureUrl('/media/photo.jpg'));

    // Another picture under the same name: the kit, its key and every document stay as they are.
    const key = kitState.get().key;
    assert.equal(chooseFile('logo.main', file('logo.png')), true);
    assert.equal(await saveForProject(), true);
    assert.equal(kitState.get().key, key, 'nothing else would say so');

    assert.equal(told.count, 1, 'the preview was told once: for the logo');
    assert.equal(cache.get(pictureUrl('/media/photo.jpg')), photo, 'other stills are kept');
    const fresh = cache.get(pictureUrl(logo));
    assert.notEqual(fresh, before);
    assert.equal(asked.length, 1);
    assert.match(
      asked[0],
      /^\/api\/media\/file\?path=%2Fkits%2Fproject%2Flogo\.png&fresh=[a-z0-9]+\.\d+$/,
    );
    cache.clear();
  });

  it('a save without files drops nothing', async () => {
    net = fakeKitServer();
    await loadProjectKit('p1');
    await beginDraft();
    chooseFile('logo.main', file('logo.png'));
    await saveForProject();
    const { cache, told } = await previewWith(['/kits/project/logo.png']);
    await beginDraft();
    assert.equal(await saveForProject(), true);
    assert.equal(told.count, 0);
    cache.clear();
  });

  it('files sent to a library kit, and a library kit that is removed, are forgotten too', async () => {
    net = fakeKitServer();
    await loadProjectKit('p1');
    await beginDraft();
    chooseFile('logo.mark', file('mark.png'));
    const { cache, told } = await previewWith(['/kits/acme-studio/mark.png']);
    assert.equal(await saveToLibrary('Acme Studio'), true);
    assert.equal(told.count, 1, 'saved over a kit of that name: its mark is read again');

    // The dialog shows the kit: its complete form has been read for its card.
    const entry = brandDialog.get().kits.find((kit) => kit.id === 'acme-studio');
    pictureKit(entry);
    await settled();
    assert.ok(Object.keys(kitPictures.get().byKit).some((slot) => slot.startsWith('acme-studio|')));
    cache.get(pictureUrl('/kits/acme-studio/mark.png'));
    await settled();
    told.count = 0;
    assert.equal(await deleteKit('acme-studio'), true);
    assert.equal(told.count, 1, 'removed with its files: the preview no longer keeps the mark');
    await loadKits();
    cache.clear();
  });
});
