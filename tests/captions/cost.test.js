/**
 * What captions cost on the server canvas at 1920×1080, next to what a
 * title costs. The server canvas puts drawing off until its pixels are
 * read, so every sample ends by reading one pixel; reading after any
 * drawing has a cost of its own, which is measured alongside and taken
 * off. The numbers are printed; the bounds are loose, because machines
 * differ and this one may be busy.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, createEnv, registerFonts } from '../../src/api/compose/index.js';
import * as captions from '../../src/utils/captions/index.js';
import { drawFrame } from '../../src/utils/compose/drawFrame.js';
import { frameInfo } from '../../src/utils/compose/frame.js';
import { createClip, createEdl, createTrack } from '../../src/utils/edl/factory.js';
import { WORDS, frameOf } from './scenes.js';

const frame = frameOf('wide', 1920);
const lines = [];
let ctx;

/** The smallest drawing there is: what reading a pixel costs after any drawing at all. */
const dot = () => ctx.fillRect(0, 0, 1, 1);

/**
 * Median milliseconds a drawing costs beyond a base drawing, each with the
 * read that makes the canvas draw. The two are sampled in turn, so a busy
 * machine slows both alike.
 */
function cost(draw, base = dot, samples = 120) {
  const times = { draw: [], base: [] };
  for (let i = -20; i < samples; i++) {
    for (const [name, run] of [
      ['base', base],
      ['draw', draw],
    ]) {
      const from = performance.now();
      run(i);
      ctx.getImageData(0, 0, 1, 1);
      if (i >= 0) times[name].push(performance.now() - from);
    }
  }
  const median = (list) => list.sort((a, b) => a - b)[samples >> 1];
  return Math.max(0, median(times.draw) - median(times.base));
}

/** A document with one title over nothing. */
function titled(text) {
  const clip = createClip({ clipId: 't', timelineStart: 0, timelineEnd: 4, sourceOut: 4, text });
  return createEdl({
    resolution: '1920x1080',
    tracks: [createTrack('video', { trackId: 'v1', clips: [clip] }), createTrack('audio')],
  });
}

describe('what captions cost', () => {
  let title = 0;

  before(() => {
    registerFonts();
    ctx = createCanvas(frame.width, frame.height).getContext('2d');
    ctx.fillStyle = '#334455';
    ctx.fillRect(0, 0, frame.width, frame.height);
    const env = createEnv();
    const look = { fontSize: 56, bold: true, outlineWidth: 5, outlineColor: '#111111' };
    const shadow = { shadowBlur: 13, shadowY: 3, shadowColor: '#00000080' };
    const draws = (edl) => () => drawFrame(ctx, edl, 1, env, frameInfo(edl, 1920, 1080));
    const empty = draws(createEdl({ resolution: '1920x1080' }));
    title = cost(draws(titled({ content: 'in 2024 we shipped', ...look, ...shadow })), empty);
    const plain = cost(draws(titled({ content: 'in 2024 we shipped', ...look })), empty);
    lines.push(`a title with an outline                ${plain.toFixed(2)} ms`);
    lines.push(`a title with an outline and a shadow   ${title.toFixed(2)} ms`);
  });

  after(() => {
    console.log(`\ncaptions at 1920×1080, median per frame, server canvas\n${lines.join('\n')}`);
  });

  for (const preset of captions.PRESET_NAMES) {
    it(`draws "${preset}" for about what a title with a shadow costs`, () => {
      // Every frame of the paragraph in turn: arrivals, sweeps and rests alike.
      const all = cost((i) =>
        captions.drawCaptionAt(ctx, WORDS, 0.4 + (i % 480) / 30, preset, frame),
      );
      const one = cost(() => captions.drawCaptionAt(ctx, WORDS, 3.9, preset, frame));
      const [whole, rest] = [all, one];
      lines.push(
        `${preset.padEnd(8)} through the paragraph ${whole.toFixed(2)} ms, one frame ${rest.toFixed(2)} ms`,
      );
      assert.ok(
        whole < Math.max(2.5 * title, 6),
        `${whole.toFixed(2)} ms against ${title.toFixed(2)}`,
      );
    });
  }

  it('costs next to nothing without a shadow, and nothing when no caption is on screen', () => {
    const bare = { preset: 'clean', shadow: { opacity: 0 } };
    const drawnBare = cost(() => captions.drawCaptionAt(ctx, WORDS, 3.9, bare, frame));
    lines.push(`clean without its shadow                ${drawnBare.toFixed(2)} ms`);
    assert.ok(drawnBare < 2, `${drawnBare.toFixed(2)} ms`);
    const from = performance.now();
    for (let i = 0; i < 20000; i++) captions.drawCaptionAt(ctx, WORDS, 100 + i, 'clean', frame);
    const each = (performance.now() - from) / 20000;
    lines.push(`no caption on screen                    ${(each * 1000).toFixed(2)} µs`);
    assert.ok(each < 0.05, `${each} ms to find that nothing is shown`);
  });

  it('finds the caption of a time among twenty thousand words without walking them', () => {
    const many = Array.from({ length: 20000 }, (_, i) => [i * 0.3, i * 0.3 + 0.25, `w${i % 9}`]);
    const style = { preset: 'karaoke' };
    captions.captionGroups(many, style);
    const from = performance.now();
    let found = 0;
    for (let i = 0; i < 100000; i++) {
      if (captions.captionAt(captions.captionGroups(many, style), (i * 0.0613) % 6000)) found++;
    }
    const each = (performance.now() - from) / 100000;
    lines.push(`groups (remembered) and the group at a time  ${(each * 1000).toFixed(2)} µs`);
    assert.ok(found > 90000 && each < 0.02, `${each} ms a lookup`);
  });
});
