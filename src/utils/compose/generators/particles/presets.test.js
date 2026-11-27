import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { doc, gen } from '../../../../../tests/compose/build.js';
import { draw } from '../../../../../tests/compose/pixels.js';
import { BLEND_MODES } from '../../blend.js';
import { requirements } from '../../requirements.js';
import { coerceParam, resolveParams } from '../../params.js';
import { PRESETS } from '../particles.js';
import { launch, motionOf, newBirth, travel } from './motion.js';
import { PARAMS } from './schema.js';
import { eachAlive, planOf } from './schedule.js';

const FRAME = { width: 1920, height: 1080, scale: 1, fps: 30, outWidth: 1920, outHeight: 1080 };
const PICTURE = '/media/leaf.png';
const preset = (id) => PRESETS.find((entry) => entry.id === id);
const resolved = (entry) => ({ seed: 11, ...resolveParams(PARAMS, entry.params) });
const scene = (entry, params = entry.params) =>
  doc([[gen('p', 'particles', params, { blendMode: entry.blendMode || 'normal' })]]);
const lit = (frame) => frame.count((r, g, b) => r + g + b > 24);

/** Mean vertical speed (output px/s, down is positive) of the particles alive at 3 s, at an age. */
function fallAt(entry, share) {
  const p = resolved(entry);
  const motion = motionOf(p, FRAME);
  const [birth, from, to] = [newBirth(), { x: 0, y: 0 }, { x: 0, y: 0 }];
  let [sum, count] = [0, 0];
  eachAlive(planOf(p), 3, (seed, index, group, _age, span, born) => {
    launch(motion, seed, index, group, born, birth);
    travel(motion, birth, span * share, from);
    travel(motion, birth, span * share + 0.05, to);
    sum += (to.y - from.y) / 0.05;
    count++;
  });
  return sum / count;
}

let images;
before(async () => {
  const canvas = createCanvas(64, 48);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.ellipse(32, 24, 30, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  images = new Map([[PICTURE, await loadImage(canvas.toBuffer('image/png'))]]);
});

describe('presets', () => {
  it('cover the looks the generator promises', () => {
    const ids = PRESETS.map((entry) => entry.id);
    for (const id of [
      'snow',
      'rain',
      'dust',
      'fireflies',
      'sparks',
      'embers',
      'confetti',
      'bubbles',
      'starfield',
      'haze',
      'images',
    ]) {
      assert.ok(ids.includes(id), `no ${id} preset`);
    }
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  });

  it('are plain data that fits the schema', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(PRESETS)), PRESETS);
    const blends = BLEND_MODES.map((mode) => mode.id);
    for (const entry of PRESETS) {
      assert.ok(entry.name && entry.description.length > 15, entry.id);
      assert.ok(entry.blendMode === undefined || blends.includes(entry.blendMode), entry.id);
      for (const [name, value] of Object.entries(entry.params)) {
        assert.ok(PARAMS[name], `${entry.id} sets unknown parameter ${name}`);
        assert.deepEqual(coerceParam(PARAMS[name], value), value, `${entry.id}.${name} = ${value}`);
      }
    }
  });

  it('stay well below the cap on particles alive', () => {
    for (const entry of PRESETS) {
      const p = resolved(entry);
      assert.equal(planOf(p).kept, 1, `${entry.id} asks for more than maxParticles`);
      let alive = 0;
      eachAlive(planOf(p), 3, () => alive++);
      assert.ok(alive <= 1200, `${entry.id} keeps ${alive} particles alive`);
    }
  });

  it('draw something from their first second on', () => {
    for (const entry of PRESETS) {
      const params = entry.id === 'images' ? { ...entry.params, image: PICTURE } : entry.params;
      for (const time of [0.3, 1, 2.5]) {
        const count = lit(draw(scene(entry, params), time, { images }));
        assert.ok(count > 40, `${entry.id} shows ${count} lit pixels at ${time} s`);
      }
    }
  });

  it('start full when they describe weather or a field', () => {
    for (const id of [
      'snow',
      'rain',
      'dust',
      'fireflies',
      'embers',
      'bubbles',
      'starfield',
      'haze',
    ]) {
      assert.equal(preset(id).params.prewarm, true, id);
      const first = lit(draw(scene(preset(id)), 0));
      const later = lit(draw(scene(preset(id)), 3));
      assert.ok(
        first > later * 0.6,
        `${id}: ${first} lit pixels on the first frame, ${later} later`,
      );
    }
  });

  it('move the way their names say', () => {
    assert.ok(fallAt(preset('snow'), 0.5) > 60, 'snow falls');
    assert.ok(fallAt(preset('rain'), 0.5) > 1000, 'rain falls fast');
    assert.ok(fallAt(preset('rain'), 0.5) > 8 * fallAt(preset('snow'), 0.5));
    for (const id of ['embers', 'bubbles', 'hearts']) {
      assert.ok(fallAt(preset(id), 0.5) < -60, `${id} rise`);
    }
    assert.ok(fallAt(preset('sparks'), 0.02) < -400, 'sparks shoot up');
    assert.ok(fallAt(preset('sparks'), 0.9) > 200, 'and arc back down');
    assert.ok(fallAt(preset('confetti'), 0.01) < -800, 'confetti is thrown up');
    const settle = fallAt(preset('confetti'), 0.8);
    assert.ok(settle > 200 && settle < 600, `and flutters down at ${settle} px/s`);
    assert.ok(Math.abs(fallAt(preset('starfield'), 0.5)) < 10, 'stars hold still');
    const paper = preset('confetti').params;
    assert.ok(paper.flip > 0 && paper.spinSpread > 0 && paper.burst > 0 && paper.rate === 0);
    assert.ok(preset('pulse').params.burstEvery > 0, 'the beat burst repeats');
  });

  it('use an image where they say so, and wait for it', () => {
    const entry = preset('images');
    assert.equal(entry.params.sprite, 'image');
    assert.equal(lit(draw(scene(entry), 1)), 0, 'nothing until a picture is chosen');
    const chosen = scene(entry, { ...entry.params, image: PICTURE });
    assert.deepEqual(requirements(chosen).images, [PICTURE], 'the host is told to load it');
    const frame = draw(chosen, 1, { images });
    assert.ok(frame.count((r, g, b) => g > 150 && r < 80 && b < 140) > 300, 'in its own colours');
  });
});
