import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen, title } from '../../../tests/compose/build.js';
import { referenceCases } from '../../../tests/compose/cases/index.js';
import { writeFixtures } from '../../../tests/compose/fixtures.js';
import { createEnv, loadImages, renderFrame } from '../../api/compose/index.js';
import { composeFor } from './host.js';
import { MAX_IDLE_FRAMES } from './pool.js';

const SIZE = { width: 320, height: 180 };
let fixtures;
let cases;
let env;
let footage = {};

/** The bytes of a frame. */
function frame(found, time = found.time ?? 1, options = {}) {
  footage = found.footage || {};
  const canvas = renderFrame(found.edl, time, { ...SIZE, env, ...options });
  return Buffer.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
}

describe('determinism', () => {
  before(async () => {
    fixtures = await writeFixtures();
    const images = await loadImages([fixtures.card, fixtures.logo]);
    env = createEnv({ images, frameOf: (clip) => images.get(footage[clip.clipId]) || null });
    cases = referenceCases(fixtures);
  });
  after(() => fixtures.remove());

  it('draws every reference frame the same twice in a row', () => {
    for (const found of cases) {
      assert.ok(frame(found).equals(frame(found)), `${found.name} differs from itself`);
    }
  });

  it('draws a frame the same after any other frames', () => {
    const first = cases.map((found) => frame(found));
    // Again, in reverse order and with other moments of each document in between.
    for (let i = cases.length - 1; i >= 0; i--) {
      frame(cases[i], 0.2);
      frame(cases[i], 3.7);
      assert.ok(frame(cases[i]).equals(first[i]), `${cases[i].name} depends on what came before`);
    }
  });

  it('draws the frames of an animation in any order', () => {
    const edl = doc([
      [
        title('t', 'Order does not matter', {
          fontSize: 120,
          outlineWidth: 4,
          animateIn: { type: 'slide-up', by: 'char', duration: 1, stagger: 0.05 },
        }),
      ],
      [gen('n', 'noise', { speed: 1, driftX: 200 }, { effects: [fx('glow', { radius: 20 })] })],
    ]);
    const times = [0, 0.2, 0.4, 0.6, 0.8, 1, 2.5];
    const forward = times.map((time) => frame({ edl }, time));
    const shuffled = [4, 0, 6, 2, 5, 1, 3];
    for (const i of shuffled) {
      assert.ok(frame({ edl }, times[i]).equals(forward[i]), `frame at ${times[i]} s`);
    }
    assert.ok(!forward[1].equals(forward[2]), 'the animation does move');
  });

  it('gives different seeds different pictures and the same seed the same one', () => {
    const noise = (seed) => ({
      edl: doc([[gen('n', 'noise', {}, { generator: { type: 'noise', seed, params: {} } })]]),
    });
    assert.ok(frame(noise(1)).equals(frame(noise(1))));
    assert.ok(!frame(noise(1)).equals(frame(noise(2))));
  });
});

describe('scratch canvases', () => {
  it('allocates nothing once every surface in use has been seen', () => {
    const { pool } = composeFor(env);
    const heavy = cases.filter((c) => /effect|track|text|transformed/.test(c.name));
    for (const found of heavy) frame(found);
    const warm = pool.stats().created;
    for (let round = 0; round < 3; round++) for (const found of heavy) frame(found);
    assert.equal(pool.stats().created, warm, 'a steady-state frame created a canvas');
    assert.equal(pool.stats().leased, 0, 'a module kept a scratch surface');
  });

  it('retires surfaces when the frame size changes, and idle ones in time', () => {
    const local = createEnv();
    const { pool } = composeFor(local);
    const edl = doc([{ opacity: 0.5, clips: [gen('a', 'solid', {}, { effects: [fx('blur')] })] }]);
    renderFrame(edl, 1, { ...SIZE, env: local });
    const first = pool.stats();
    assert.ok(first.created >= 2 && first.free === first.created, JSON.stringify(first));
    renderFrame(edl, 1, { width: 160, height: 90, env: local });
    assert.equal(pool.stats().free, pool.stats().created - first.created, 'old sizes were dropped');
    const plain = doc([[gen('a', 'solid')]]);
    for (let i = 0; i <= MAX_IDLE_FRAMES + 1; i++)
      renderFrame(plain, 1, { width: 160, height: 90, env: local });
    assert.ok(pool.stats().free <= 1, `idle surfaces linger: ${pool.stats().free}`);
  });
});
