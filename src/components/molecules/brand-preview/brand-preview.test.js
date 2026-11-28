import { fixture, expect, waitUntil } from '@open-wc/testing';
import { startDraft, setToken } from '#utils/brandUi/draft.js';
import { previewKit } from '#utils/brandUi/previewKit.js';
import { kitOf } from '#utils/brandUi/testkit.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './brand-preview.js';
import { previewItems } from './brand-preview.js';

const kit = kitOf('clean');
/** How many pixels of a canvas are (nearly) a colour. */
const count = (canvas, [r, g, b]) => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) < 24) n++;
  }
  return n;
};

describe('brand-preview', () => {
  it('shows several of the kit’s elements, each drawn', async () => {
    const el = await fixture('<brand-preview style="display:block;width:640px"></brand-preview>');
    Object.assign(el, { kit, like: { resolution: '1920x1080', fps: 30 } });
    await settle(200);
    const items = [...el.querySelectorAll('li')];
    expect(items.map((item) => item.dataset.element)).to.deep.equal([
      'lower-third',
      'title',
      'quote',
      'intro',
      'outro',
      'bug',
    ]);
    expect(
      previewItems({ ...kit, elements: { caption: kit.elements.caption } }).map((i) => i.id),
    ).to.deep.equal(['caption']);
    expect(el.querySelector('ul').dataset.format).to.equal('wide');
    await waitUntil(
      () => count(el.querySelector('[data-element="intro"] canvas'), [11, 18, 32]) > 1000,
      'the intro’s background',
    );
  });

  it('redraws when a token changes', async () => {
    const el = await fixture('<brand-preview style="display:block;width:640px"></brand-preview>');
    Object.assign(el, { kit, like: { resolution: '1920x1080', fps: 30 } });
    await settle(200);
    const canvas = () => el.querySelector('[data-element="lower-third"] canvas');
    expect(count(canvas(), [255, 0, 255])).to.equal(0);
    const draft = setToken(
      startDraft({ choice: 'builtin:clean', kit: null }),
      'color.primary',
      '#ff00ff',
      kit,
    );
    el.kit = previewKit(kit, draft);
    await waitUntil(
      () => count(canvas(), [255, 0, 255]) > 20,
      'the new primary colour shows in the bar',
    );
  });

  it('plays an element’s motion while it is pointed at or focused; vertical pictures sit three across', async () => {
    const el = await fixture('<brand-preview style="display:block;width:640px"></brand-preview>');
    Object.assign(el, { kit, like: { resolution: '1080x1920', fps: 30 } });
    await settle(200);
    expect(el.querySelector('ul').dataset.format).to.equal('tall');
    const item = el.querySelector('[data-element="title"]');
    item.focus();
    await waitUntil(() => item.querySelector('brand-frame').playing === true);
    item.blur();
    await waitUntil(() => item.querySelector('brand-frame').playing === false);
  });
});
