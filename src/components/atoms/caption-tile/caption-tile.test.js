import { fixture, expect, waitUntil } from '@open-wc/testing';
import { SAMPLE_STILL, drawTile } from '#utils/captionsUi/sample.js';
import './caption-tile.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pixels = (el) => {
  const canvas = el.querySelector('canvas');
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
};
const same = (a, b) => a.every((value, i) => value === b[i]);

/** What a canvas of the tile's size shows for a style at an instant, drawn here. */
function expected(style, time, width = 320, height = 160) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  drawTile(ctx, style, time, canvas);
  return ctx.getImageData(0, 0, width, height).data;
}

async function mount(html) {
  await document.fonts.load('700 24px "Inter"', 'Say it').catch(() => {});
  const el = await fixture(html);
  await frame();
  await wait(60);
  return el;
}

describe('caption-tile', () => {
  it('draws its preset at the resting instant on a canvas twice as wide as high', async () => {
    const el = await mount('<caption-tile preset="boxed"></caption-tile>');
    const canvas = el.querySelector('canvas');
    expect([canvas.width, canvas.height]).to.deep.equal([320, 160]);
    expect(canvas.getAttribute('aria-hidden')).to.equal('true');
    await waitUntil(() => same(pixels(el), expected('boxed', SAMPLE_STILL)), 'the tile settles');
    expect(same(pixels(el), expected('clean', SAMPLE_STILL))).to.equal(false);
  });

  it('shows a style given to it instead of the preset, and follows when it changes', async () => {
    const el = await mount('<caption-tile preset="clean"></caption-tile>');
    el.look = { preset: 'clean', color: '#ff0000', size: 8 };
    await frame();
    await waitUntil(() => same(pixels(el), expected(el.look, SAMPLE_STILL)), 'the look shows');
    el.look = {};
    el.preset = 'pop';
    await frame();
    await waitUntil(() => same(pixels(el), expected('pop', SAMPLE_STILL)), 'back to a preset');
  });

  it('moves while playing and comes to rest again', async () => {
    const el = await mount('<caption-tile preset="pop" playing></caption-tile>');
    expect(el.querySelector('canvas').dataset.playing).to.equal('true');
    // A fingerprint of the picture, taken a dozen times over a second.
    const print = (data) => data.reduce((sum, v, j) => (sum + v * ((j % 97) + 1)) % 1000003, 0);
    const seen = new Set();
    for (let i = 0; i < 12; i++) {
      await wait(90);
      seen.add(print(pixels(el)));
    }
    expect(seen.size).to.be.greaterThan(3);
    el.playing = false;
    await frame();
    await waitUntil(() => same(pixels(el), expected('pop', SAMPLE_STILL)), 'it rests');
    const rest = pixels(el);
    await wait(200);
    expect(same(pixels(el), rest)).to.equal(true);
  });

  it('takes the size it is given', async () => {
    const el = await mount('<caption-tile preset="minimal" size="200"></caption-tile>');
    const canvas = el.querySelector('canvas');
    expect([canvas.width, canvas.height]).to.deep.equal([200, 100]);
    await waitUntil(
      () => same(pixels(el), expected('minimal', SAMPLE_STILL, 200, 100)),
      'drawn at that size',
    );
  });
});
