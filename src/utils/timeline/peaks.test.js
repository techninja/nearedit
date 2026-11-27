import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWave, filmstripTiles, stripColumns, waveColumns } from './peaks.js';

describe('waveform columns', () => {
  const peaks = Array.from({ length: 1000 }, (_, i) => (i % 100) / 100);
  const wave = buildWave(peaks, 100); // 10 s of audio

  it('keeps the peaks and a coarser copy', () => {
    assert.equal(wave.fine.length, 1000);
    assert.equal(wave.coarse.length, 63);
    assert.ok(Math.abs(wave.coarse[0] - 0.15) < 1e-6, 'max of the first 16');
    assert.equal(wave.rate, 100);
  });

  it('gives one amplitude per column: the loudest peak under it', () => {
    const columns = waveColumns(wave, 0, 0.1, 5);
    assert.equal(columns.length, 5);
    for (const [i, expected] of [0.09, 0.19, 0.29, 0.39, 0.49].entries()) {
      assert.ok(Math.abs(columns[i] - expected) < 1e-6, `column ${i}: ${columns[i]}`);
    }
  });

  it('interpolates nothing when zoomed past the peak rate', () => {
    const columns = waveColumns(wave, 0.5, 0.001, 30);
    assert.ok(columns.every((value) => Math.abs(value - 0.5) < 0.031));
  });

  it('uses the coarse copy when a column spans many peaks, with the same picture', () => {
    const fine = waveColumns(buildWave(peaks, 100), 0, 1, 10);
    assert.ok(fine.every((value) => Math.abs(value - 0.99) < 1e-6));
    const big = buildWave(new Float32Array(200_000).fill(0.25), 30);
    const started = performance.now();
    const columns = waveColumns(big, 0, 6, 1000);
    assert.ok(performance.now() - started < 30, 'an hour of audio in a thousand columns is quick');
    assert.ok(Math.abs(columns[500] - 0.25) < 1e-6);
  });

  it('is silent beyond the ends of the source', () => {
    assert.deepEqual([...waveColumns(wave, -1, 0.1, 3)], [0, 0, 0]);
    assert.deepEqual([...waveColumns(wave, 10, 0.1, 3)], [0, 0, 0]);
    assert.equal(waveColumns(wave, 0, 0.1, 0).length, 0);
    assert.equal(waveColumns(wave, 0, 0.1, -5).length, 0);
  });
});

describe('filmstrips', () => {
  it('asks for about one frame every two seconds, within the route limits', () => {
    assert.equal(stripColumns(0), 1, 'unknown duration');
    assert.equal(stripColumns(60, true), 1, 'a still');
    assert.equal(stripColumns(3), 4);
    assert.equal(stripColumns(21.4), 11);
    assert.equal(stripColumns(3600), 40);
  });

  it('anchors tiles to the source so trimming uncovers frames', () => {
    const strip = { tileWidth: 50, pps: 100, duration: 10, cols: 10 };
    const whole = filmstripTiles({ x0: 0, x1: 300, sourceIn: 0 }, strip, 1000);
    assert.deepEqual(
      whole.map((tile) => [tile.x, tile.cell]),
      [
        [0, 0],
        [50, 0],
        [100, 1],
        [150, 1],
        [200, 2],
        [250, 2],
      ],
    );
    // the same clip trimmed by 1 s at the start: same frames in the same places
    const trimmed = filmstripTiles({ x0: 100, x1: 300, sourceIn: 1 }, strip, 1000);
    assert.deepEqual(trimmed, whole.slice(2));
  });

  it('lays out only the tiles on screen', () => {
    const strip = { tileWidth: 50, pps: 100, duration: 3600, cols: 40 };
    const tiles = filmstripTiles({ x0: -200_000, x1: 160_000, sourceIn: 0 }, strip, 1200);
    assert.ok(tiles.length <= 26, `${tiles.length} tiles`);
    assert.ok(tiles[0].x <= 0 && tiles[0].x > -50);
    assert.equal(tiles[0].cell, 22, '2000 s into an hour of 40 frames');
  });

  it('repeats the one frame of a still, anchored to the clip', () => {
    const strip = { tileWidth: 80, pps: 100, duration: 0, cols: 1 };
    const tiles = filmstripTiles({ x0: 30, x1: 250, sourceIn: 0 }, strip, 1000);
    assert.deepEqual(
      tiles.map((tile) => [tile.x, tile.cell]),
      [
        [30, 0],
        [110, 0],
        [190, 0],
      ],
    );
  });

  it('stays inside the strip at the very end of the source', () => {
    const strip = { tileWidth: 50, pps: 100, duration: 2, cols: 4 };
    const tiles = filmstripTiles({ x0: 0, x1: 400, sourceIn: 0 }, strip, 1000);
    assert.ok(tiles.every((tile) => tile.cell >= 0 && tile.cell <= 3));
  });
});
