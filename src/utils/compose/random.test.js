import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, fractal, hash, noise2, noise3, rand, randRange, seedOf } from './random.js';

describe('hash and rand', () => {
  it('is a pure function of the seed and the keys', () => {
    assert.equal(hash(7, 1, 2, 3), hash(7, 1, 2, 3));
    assert.equal(rand(7, 42), rand(7, 42));
    assert.notEqual(hash(7, 1, 2, 3), hash(8, 1, 2, 3));
    assert.notEqual(hash(7, 1, 2, 3), hash(7, 2, 1, 3));
    assert.notEqual(rand(7, 1, 0), rand(7, 1, 1), 'another key, another property');
    assert.equal(hash(7), hash(7, 0, 0, 0));
  });

  it('gives the values it always gave (documents depend on them)', () => {
    assert.equal(hash(0), 937260802);
    assert.equal(hash(1, 2, 3, 4), 3345487507);
    assert.equal(rand(11, 5).toFixed(6), '0.978273');
  });

  it('is uniform in [0, 1)', () => {
    const buckets = new Array(10).fill(0);
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const value = rand(3, i);
      assert.ok(value >= 0 && value < 1);
      buckets[Math.floor(value * 10)]++;
      sum += value;
    }
    assert.ok(Math.abs(sum / 20000 - 0.5) < 0.01, `mean ${sum / 20000}`);
    for (const count of buckets) assert.ok(Math.abs(count - 2000) < 200, `bucket of ${count}`);
  });

  it('does not correlate neighbouring keys or seeds', () => {
    let along = 0;
    let across = 0;
    for (let i = 0; i < 5000; i++) {
      along += (rand(1, i) - 0.5) * (rand(1, i + 1) - 0.5);
      across += (rand(i, 9) - 0.5) * (rand(i + 1, 9) - 0.5);
    }
    assert.ok(
      Math.abs(along / 5000) < 0.005 && Math.abs(across / 5000) < 0.005,
      `${along}, ${across}`,
    );
  });

  it('scales into a range and truncates fractional keys', () => {
    for (let i = 0; i < 100; i++) {
      const value = randRange(-3, 5, 2, i);
      assert.ok(value >= -3 && value < 5);
    }
    assert.equal(rand(1, 4.9), rand(1, 4));
  });
});

describe('seedOf', () => {
  it('turns numbers and strings into stable 32-bit seeds', () => {
    assert.equal(seedOf(5), seedOf(5));
    assert.notEqual(seedOf(5), seedOf(6));
    assert.equal(seedOf('intro'), seedOf('intro'));
    assert.notEqual(seedOf('intro'), seedOf('outro'));
    for (const value of [0, -1, 1e12, 'x', undefined, NaN, null]) {
      const seed = seedOf(value);
      assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32, `${value} → ${seed}`);
    }
  });
});

describe('createRandom', () => {
  it('repeats its sequence for a seed and differs between seeds', () => {
    const take = (seed) => {
      const random = createRandom(seed);
      return Array.from({ length: 5 }, () => random.next());
    };
    assert.deepEqual(take(9), take(9));
    assert.notDeepEqual(take(9), take(10));
    assert.ok(take(9).every((value) => value >= 0 && value < 1));
  });

  it('draws ranges and integers', () => {
    const random = createRandom(4);
    for (let i = 0; i < 200; i++) {
      const value = random.range(10, 20);
      const index = random.int(6);
      assert.ok(value >= 10 && value < 20);
      assert.ok(Number.isInteger(index) && index >= 0 && index < 6);
    }
  });
});

describe('value noise', () => {
  it('is deterministic, within 0..1 and equal to the lattice at whole numbers', () => {
    assert.equal(noise2(1.3, 4.7, 5), noise2(1.3, 4.7, 5));
    assert.equal(noise2(3, 8, 5), rand(5, 3, 8));
    for (let i = 0; i < 500; i++) {
      const value = noise3(i * 0.37, i * 0.11, i * 0.05, 2);
      assert.ok(value >= 0 && value <= 1);
    }
  });

  it('is continuous: a small step changes it a little', () => {
    for (let i = 0; i < 300; i++) {
      const [x, y, z] = [i * 0.173, i * 0.091, i * 0.047];
      assert.ok(Math.abs(noise2(x + 0.001, y, 1) - noise2(x, y, 1)) < 0.005);
      assert.ok(Math.abs(noise3(x, y, z + 0.001, 1) - noise3(x, y, z, 1)) < 0.005);
      assert.ok(Math.abs(fractal(x, y + 0.001, z, 1, 4) - fractal(x, y, z, 1, 4)) < 0.02);
    }
  });

  it('changes with the seed and with every axis', () => {
    assert.notEqual(noise2(1.5, 2.5, 1), noise2(1.5, 2.5, 2));
    assert.notEqual(noise3(1.5, 2.5, 0.2, 1), noise3(1.5, 2.5, 0.8, 1));
    assert.notEqual(fractal(1.5, 2.5, 0.2, 1, 1), fractal(1.5, 2.5, 0.2, 1, 5));
    assert.equal(fractal(1.5, 2.5, 0.2, 1, 0), 0);
    assert.ok(fractal(1.5, 2.5, 0.2, 1) >= 0 && fractal(1.5, 2.5, 0.2, 1) <= 1);
  });
});
