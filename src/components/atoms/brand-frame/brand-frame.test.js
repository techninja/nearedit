import { fixture, expect, waitUntil } from '@open-wc/testing';
import { elementThumb } from '#utils/brandUi/elementThumb.js';
import { kitOf } from '#utils/brandUi/testkit.js';
import './brand-frame.js';

const lit = (canvas) => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 40) count++;
  return count / (data.length / 4);
};

describe('brand-frame', () => {
  const kit = kitOf('bold');

  it('draws an element with the compositor, in the shape of its document', async () => {
    const el = await fixture('<brand-frame style="width:320px"></brand-frame>');
    el.spec = elementThumb(kit, 'intro', { resolution: '1920x1080', fps: 30 });
    await waitUntil(() => el.querySelector('canvas')?.width === 480);
    const canvas = el.querySelector('canvas');
    expect([canvas.width, canvas.height]).to.deep.equal([480, 270]);
    await waitUntil(() => lit(canvas) > 0.1, 'the intro was drawn');
  });

  it('takes the shape of the part of the frame it shows, and the size it is given', async () => {
    const el = await fixture('<brand-frame></brand-frame>');
    el.size = 320;
    el.spec = elementThumb(kit, 'lower-third', { resolution: '1080x1920' }, { aspect: 16 / 9 });
    await waitUntil(() => el.querySelector('canvas')?.width === 320);
    expect(el.querySelector('canvas').height).to.equal(180);
    el.spec = elementThumb(kit, 'lower-third', { resolution: '1080x1920' });
    await waitUntil(() => el.querySelector('canvas').height === 320);
    expect(el.querySelector('canvas').width).to.be.lessThan(320);
  });

  it('plays the motion while asked to, and draws nothing without a document', async () => {
    const el = await fixture('<brand-frame></brand-frame>');
    await waitUntil(() => el.querySelector('canvas'));
    expect(lit(el.querySelector('canvas'))).to.equal(0);
    el.spec = elementThumb(kit, 'title', {});
    el.playing = true;
    await waitUntil(() => el.querySelector('canvas').dataset.playing === 'true');
    await waitUntil(() => lit(el.querySelector('canvas')) > 0.1);
    el.playing = false;
    await waitUntil(() => el.querySelector('canvas').dataset.playing === 'false');
  });
});
