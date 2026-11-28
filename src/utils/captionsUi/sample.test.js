import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { captionAt } from '#utils/captions/at.js';
import { captionGroups } from '#utils/captions/groups.js';
import { PRESET_NAMES } from '#utils/captions/style.js';
import { unitOf } from '#utils/captions/metrics.js';
import { registerFonts } from '../../api/compose/fonts.js';
import {
  SAMPLE_LOOP,
  SAMPLE_STILL,
  SAMPLE_WORDS,
  TILE_ASPECT,
  drawTile,
  tileFontNeed,
  tileFrame,
} from './sample.js';

registerFonts();
const SIZE = { width: 320, height: 320 / TILE_ASPECT };

/** Draw a tile and hand back its pixels. */
function tile(style, time) {
  const canvas = createCanvas(SIZE.width, SIZE.height);
  const ctx = canvas.getContext('2d');
  const drawn = drawTile(/** @type {any} */ (ctx), style, time, SIZE);
  return { drawn, data: ctx.getImageData(0, 0, SIZE.width, SIZE.height).data };
}
const differ = (a, b) => a.some((value, i) => value !== b[i]);

describe('the picture on a caption tile', () => {
  it('is a close view: seventy units across, whatever the tile’s size', () => {
    assert.ok(Math.abs(unitOf(tileFrame(320, 160)) - 320 / 70) < 1e-9);
    assert.ok(Math.abs(unitOf(tileFrame(700, 350)) - 10) < 1e-9);
    const need = tileFontNeed('pop', 700, 350);
    assert.match(need.font, /^900 74px "Inter"/);
    assert.ok(need.text.includes('screen.') && need.text.includes('SCREEN.'));
  });

  it('shows every preset with a word marked at the resting instant', () => {
    const backdrop = tile('clean', SAMPLE_LOOP - 0.05);
    assert.equal(backdrop.drawn, false, 'between two loops only the backdrop shows');
    const pictures = PRESET_NAMES.map((name) => tile(name, SAMPLE_STILL));
    for (const [i, picture] of pictures.entries()) {
      assert.equal(picture.drawn, true, PRESET_NAMES[i]);
      assert.ok(differ(picture.data, backdrop.data), PRESET_NAMES[i]);
      for (const other of pictures.slice(i + 1)) assert.ok(differ(picture.data, other.data));
      const found = captionAt(captionGroups(SAMPLE_WORDS, PRESET_NAMES[i]), SAMPLE_STILL);
      assert.equal(found.group.words[found.word].text.toLowerCase().replace('.', ''), 'shows');
    }
  });

  it('moves, loops, and follows a style that was changed by hand', () => {
    assert.ok(differ(tile('pop', 0.3).data, tile('pop', 1.3).data));
    assert.deepEqual(tile('boxed', 1).data, tile('boxed', 1 + SAMPLE_LOOP).data);
    assert.deepEqual(tile('boxed', 1).data, tile('boxed', 1 - SAMPLE_LOOP).data);
    const red = tile({ preset: 'clean', color: '#ff0000' }, SAMPLE_STILL);
    assert.ok(differ(red.data, tile('clean', SAMPLE_STILL).data));
  });

  it('never needs a line to shrink: every preset’s widest group fits the tile', () => {
    const frame = tileFrame(SIZE.width, SIZE.height);
    for (const name of PRESET_NAMES) {
      const canvas = createCanvas(SIZE.width, SIZE.height);
      const ctx = canvas.getContext('2d');
      ctx.font = tileFontNeed(name, SIZE.width, SIZE.height).font;
      const widest = Math.max(
        ...captionGroups(SAMPLE_WORDS, name).flatMap((group) =>
          group.text.split('\n').map((line) => ctx.measureText(line).width),
        ),
      );
      assert.ok(widest < frame.width * 0.8, `${name}: ${Math.round(widest)} of ${frame.width}`);
    }
  });
});
