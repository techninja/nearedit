import { fixture, expect, waitUntil } from '@open-wc/testing';
import { generatorThumb } from '#utils/create/thumbDoc.js';
import './create-thumb.js';

const mean = (canvas) => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  return sum.map((v) => Math.round(v / (data.length / 4)));
};
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function mount(spec) {
  const el = await fixture('<create-thumb style="width:160px"></create-thumb>');
  el.spec = spec;
  await waitUntil(() => el.querySelector('canvas')?.width > 1);
  await frame();
  return { el, canvas: el.querySelector('canvas') };
}

describe('create-thumb', () => {
  it('draws the document with the frame compositor, at the output aspect ratio', async () => {
    const solid = generatorThumb({ type: 'solid', params: { color: '#ff0000' } });
    const { canvas } = await mount(solid);
    expect([canvas.width, canvas.height]).to.deep.equal([256, 144]);
    expect(mean(canvas)).to.deep.equal([255, 0, 0]);
    const tall = generatorThumb({ type: 'solid' }, { resolution: '1080x1920' });
    expect((await mount(tall)).canvas.height).to.equal(144);
    expect((await mount(tall)).canvas.width).to.equal(81);
  });

  it('follows a new document', async () => {
    const { el, canvas } = await mount(
      generatorThumb({ type: 'solid', params: { color: '#ff0000' } }),
    );
    el.spec = generatorThumb({ type: 'solid', params: { color: '#0000ff' } });
    await waitUntil(() => mean(canvas)[2] === 255);
  });

  it('plays the clip while asked to, and rests on one moment otherwise', async () => {
    const moving = generatorThumb({ type: 'noise', seed: 2, params: { speed: 4 } });
    const { el, canvas } = await mount(moving);
    const still = canvas.toDataURL();
    await frame();
    expect(canvas.toDataURL(), 'at rest nothing moves').to.equal(still);
    el.playing = true;
    await waitUntil(() => canvas.toDataURL() !== still, 'playing redraws');
    el.playing = false;
    await waitUntil(() => canvas.toDataURL() === still, 'back to the resting moment');
  });
});
