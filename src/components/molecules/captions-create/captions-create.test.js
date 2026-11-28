import { fixture, expect, waitUntil } from '@open-wc/testing';
import { TALK, TALK_SIDECAR, talkDoc } from '#utils/captionsUi/testkit.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { patchCaptionStyle } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { forgetSidecars } from '#utils/media/sidecars.js';
import { installFakeServer } from '#utils/media/testing/fakeServer.js';
import './captions-create.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
async function mount(doc = talkDoc()) {
  server?.restore();
  server = installFakeServer({
    'GET /api/sidecar': ({ url }) =>
      url.searchParams.get('path') === TALK ? TALK_SIDECAR : { exists: false },
  });
  forgetSidecars();
  loadDoc(doc);
  const el = await fixture('<captions-create></captions-create>');
  const said = [];
  el.addEventListener('captions-status', (event) => said.push(event.detail.message));
  await wait(40);
  return { el, said };
}

describe('captions-create', () => {
  afterEach(() => server?.restore());

  it('is an entry for captions: a tile in the timeline’s style, and what it does', async () => {
    const { el } = await mount(patchCaptionStyle(talkDoc(), 'preset', 'boxed'));
    expect(el.querySelector('.field-group-title').textContent).to.equal('Captions');
    const tile = el.querySelector('caption-tile');
    expect(tile.preset).to.equal('boxed');
    expect(el.querySelector('.create-panel-name').textContent).to.equal('Caption all speech');
    expect(el.querySelector('.captions-create-about').textContent).to.contain('(Boxed)');
  });

  it('captions all speech when pressed and says what happened', async () => {
    const { el, said } = await mount();
    el.querySelector('.captions-create-tile').click();
    expect(said[0]).to.equal('Looking for speech with a transcript…');
    await waitUntil(() => said.length === 2);
    expect(said[1]).to.match(
      /^Captions on for 1 clip — No transcript yet for memo\.wav, song\.mp3/,
    );
    expect(clipOf(getDoc(), 'a').captions.on).to.equal(true);
    expect(clipOf(getDoc(), 'memo').captions).to.equal(undefined);
    expect(undo()).to.equal(true);
    expect(undo()).to.equal(false);
    el.querySelector('.captions-create-tile').click();
    await waitUntil(() => said.length === 4);
    expect(said[3]).to.match(/^Captions on for 1 clip/);
  });

  it('moves its tile only while pointed at or focused', async () => {
    const { el } = await mount();
    const button = el.querySelector('.captions-create-tile');
    const canvas = () => el.querySelector('caption-tile canvas');
    expect(canvas().dataset.playing).to.equal('false');
    button.dispatchEvent(new Event('pointerenter'));
    await waitUntil(() => canvas().dataset.playing === 'true');
    button.dispatchEvent(new Event('pointerleave'));
    await waitUntil(() => canvas().dataset.playing === 'false');
    button.focus();
    await waitUntil(() => canvas().dataset.playing === 'true');
  });
});
