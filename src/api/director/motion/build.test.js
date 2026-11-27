import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectModule, generatorModule } from '#utils/compose/index.js';
import { THEMES, themeIds } from '#utils/director/motion/themes.js';
import { PARTICLE_PRESETS, TRANSITIONS, wipeShape } from '#utils/director/motion/vocab.js';
import { timelineDuration } from '#utils/edl/query.js';
import { checkResult } from '../testing/invariants.js';
import { ROWS } from './build.js';
import { scaledParams } from './particles.js';
import { BRIEF, FORMATS, buildPiece, mergePiece, planFor, row, withoutIds } from './testkit.js';

const clipsOf = (/** @type {any} */ built) => built.tracks.flatMap((track) => track.clips);
const frames = (/** @type {number} */ seconds, /** @type {number} */ fps) => seconds * fps;
const isWhole = (/** @type {number} */ value) => Math.abs(value - Math.round(value)) < 1e-6;

/** Every generator, effect, parameter and keyframe of a clip exists in the catalog. */
function assertKnownToCatalog(clip) {
  const generator = clip.generator.type ? generatorModule(clip.generator.type) : null;
  if (clip.generator.type) {
    assert.ok(generator, `unknown generator ${clip.generator.type}`);
    for (const name of Object.keys(clip.generator.params)) {
      assert.ok(generator.params[name], `${clip.generator.type} has no parameter ${name}`);
    }
  }
  for (const fx of clip.effects) {
    const module = effectModule(fx.type);
    assert.ok(module, `unknown effect ${fx.type}`);
    for (const name of Object.keys(fx.params)) {
      assert.ok(module.params[name], `${fx.type} has no parameter ${name}`);
    }
  }
  for (const [path, keys] of Object.entries(clip.keyframes)) {
    const [root, second, third] = path.split('.');
    const spec =
      root === 'generator'
        ? generator.params[third]
        : effectModule(clip.effects.find((fx) => fx.effectId === second)?.type)?.params[third];
    assert.ok(spec?.animatable, `${clip.label}: ${path} cannot be keyframed`);
    assert.ok(keys.length >= 2, `${path} does not move`);
    keys.forEach((key, i) => {
      assert.ok(key.t >= clip.sourceIn - 1e-9 && key.t <= clip.sourceOut + 1e-9, `${path} t`);
      if (i) assert.ok(key.t > keys[i - 1].t, `${path} keys in order`);
    });
  }
}

test('every theme at 16:9, 9:16 and 1:1 builds a valid, media-free fragment', () => {
  for (const theme of themeIds()) {
    for (const format of FORMATS) {
      for (const seed of [1, 6]) {
        const where = `${theme} ${format.name} seed ${seed}`;
        const { built, result } = buildPiece(planFor({ theme, seed }), { format, seed });
        assert.deepEqual(checkResult(result, { fps: format.fps }), [], where);
        assert.deepEqual(
          built.tracks.map((track) => [track.type, track.index, track.name]),
          ROWS.map((name, index) => ['video', index, name]),
        );
        assert.deepEqual(built.notes, [], where);
        for (const clip of clipsOf(built)) {
          assert.equal(clip.sourceFile, '', 'no media');
          assert.ok(clip.generator.type || clip.text.content, 'a generator or a title');
          assert.equal(clip.sourceIn, 0);
          for (const edge of [clip.timelineStart, clip.timelineEnd]) {
            assert.ok(isWhole(frames(edge, format.fps)), `${where}: ${edge} off the frame grid`);
          }
          assertKnownToCatalog(clip);
        }
        const { edl, problems } = mergePiece(result, format);
        assert.deepEqual(problems, [], where);
        assert.equal(timelineDuration(edl), built.seconds);
      }
    }
  }
});

test('nothing stands still: every background and accent carries keyframes', () => {
  for (const theme of themeIds()) {
    const { built } = buildPiece(planFor({ theme, seed: 3, scene: { accent: 'ring' } }));
    for (const name of ['Background A', 'Background B', 'Accents']) {
      for (const clip of row(built, name)) {
        const moving = Object.keys(clip.keyframes).filter((p) => p.startsWith('generator.'));
        // Noise evolves by itself (its `speed`); everything else is keyed.
        assert.ok(moving.length >= 1, `${theme}: ${clip.label} is static`);
      }
    }
    for (const clip of [...row(built, 'Titles'), ...row(built, 'Text')]) {
      assert.notEqual(clip.text.animateIn.type, 'none', `${theme}: ${clip.label}`);
    }
  }
});

test('the target duration is honoured exactly; scenes scale together', () => {
  const plan = planFor({ theme: 'midnight' });
  const natural = buildPiece(plan).built;
  for (const [duration, fps] of [
    [20, 30],
    [45, 25],
    [12, 23.976],
  ]) {
    const format = { fps, width: 1920, height: 1080 };
    const { built, result } = buildPiece(plan, { format, duration });
    assert.ok(Math.abs(built.seconds - Math.round(duration * fps) / fps) < 1e-9, `${duration}s`);
    assert.deepEqual(checkResult(result, { fps }), []);
    assert.deepEqual(mergePiece(result, format).problems, []);
    const lengths = built.shots.map((shot) => shot.endF - shot.startF);
    const before = natural.shots.map((shot) => shot.endF - shot.startF);
    assert.equal(lengths.indexOf(Math.max(...lengths)), before.indexOf(Math.max(...before)));
  }
  const fixed = planFor({ theme: 'paper', scene: { duration: 2 } });
  assert.equal(buildPiece(fixed).built.seconds, 10, 'five scenes of two seconds');
  assert.equal(buildPiece(fixed, { duration: 30 }).built.seconds, 30);
});

test('transitions overlap on two rows; the clip in front carries the fade or the wipe', () => {
  for (const kind of TRANSITIONS) {
    const plan = planFor({ theme: 'pop', scene: { transition: kind } });
    const { built, format } = buildPiece(plan);
    const { fps } = format;
    const [a, b] = [row(built, 'Background A'), row(built, 'Background B')];
    assert.deepEqual([a.length, b.length], [2, 3], 'scenes alternate between the rows');
    built.shots.slice(1).forEach((shot) => {
      const before = built.shots[shot.index - 1];
      const startsAt = (/** @type {number} */ f) => (/** @type {any} */ c) =>
        Math.abs(c.timelineStart * fps - f) < 1e-6;
      const mine = (shot.front ? a : b).find(startsAt(shot.startF));
      const outgoing = (shot.front ? b : a).find(startsAt(before.startF));
      const overlap = Math.round((outgoing.timelineEnd - mine.timelineStart) * fps);
      assert.equal(overlap, shot.inF, `${kind}: scene ${shot.index + 1}`);
      assert.equal(overlap > 0, kind !== 'cut');
      const front = shot.front ? mine : outgoing;
      const back = shot.front ? outgoing : mine;
      const side = shot.front ? 'In' : 'Out';
      const fx = front.effects.find((e) => e.effectId === `wipe${side}`);
      const shape = wipeShape(kind);
      if (shape) {
        assert.equal(fx.type, 'wipe');
        assert.equal(fx.params.shape, shape);
        assert.equal(Boolean(fx.params.invert), !shot.front, 'uncovering wipes the front off');
        const keys = front.keyframes[`effects.wipe${side}.progress`];
        assert.deepEqual([keys[0].v, keys.at(-1).v], [0, 1]);
        const spanF = Math.round((keys.at(-1).t - keys[0].t) * fps);
        assert.equal(spanF, shot.inF);
        const startsF = Math.round((front.timelineStart + keys[0].t) * fps);
        assert.equal(startsF, shot.startF, 'the wipe begins where the scene begins');
      } else {
        assert.equal(fx, undefined);
        const fade = shot.front ? front.fadeIn : front.fadeOut;
        assert.ok(Math.abs(fade * fps - shot.inF) < 1e-6, `${kind}: fade of ${fade}`);
      }
      // The clip behind is never faded or wiped by this transition.
      assert.equal(shot.front ? back.fadeOut : back.fadeIn, 0);
      assert.ok(!back.effects.some((e) => e.effectId === (shot.front ? 'wipeOut' : 'wipeIn')));
    });
    const last = b.at(-1);
    assert.ok(last.fadeOut > 0, 'the piece ends on a fade to nothing');
    assert.equal(mergePiece(buildPiece(plan).result, format).problems.length, 0, kind);
  }
});

test('words arrive after their scene starts and are gone when the next begins', () => {
  const { built, format } = buildPiece(planFor({ theme: 'sunrise', scene: { accent: 'rule' } }));
  const titles = row(built, 'Titles');
  const subtitles = row(built, 'Text');
  assert.equal(titles.length, 5);
  assert.equal(subtitles.length, 3, 'three lines of the brief carry a subtitle');
  built.shots.forEach((shot, i) => {
    const title = titles[i];
    assert.equal(Math.round(title.timelineStart * format.fps), shot.textF);
    assert.equal(Math.round(title.timelineEnd * format.fps), shot.textEndF);
    assert.equal(title.intent, 'title');
    assert.equal(title.text.animateOut.type, shot.outSeconds ? 'fade' : 'none');
  });
  for (const sub of subtitles) {
    const title = titles.find((t) => t.timelineEnd === sub.timelineEnd);
    assert.ok(sub.timelineStart > title.timelineStart, 'the subtitle follows the title');
  }
  for (const rule of row(built, 'Accents')) {
    const title = titles.find((t) => t.timelineEnd === rule.timelineEnd);
    assert.ok(rule.timelineStart >= title.timelineStart);
    assert.equal(rule.generator.params.shape, 'line');
    assert.equal(rule.keyframes['generator.params.widthPx'][0].v, 0, 'the rule draws itself');
  }
  assert.deepEqual(
    built.markers.map((m) => [Math.round(m.time * format.fps), m.label]),
    built.shots.map((shot) => [shot.startF, shot.scene.title]),
  );
});

test('particles: one clip per run of a preset, a burst per scene, scaled to the frame', () => {
  const same = buildPiece(planFor({ theme: 'midnight', particles: 'dust' })).built;
  const [field] = row(same, 'Particles');
  assert.equal(row(same, 'Particles').length, 1, 'the field runs through every transition');
  assert.deepEqual([field.timelineStart, field.timelineEnd], [0, same.seconds]);
  assert.equal(field.blendMode, 'add');
  assert.equal(
    field.generator.params.size,
    PARTICLE_PRESETS.find((p) => p.id === 'dust').params.size,
  );

  const bursts = buildPiece(planFor({ theme: 'pop', particles: 'confetti' })).built;
  assert.equal(row(bursts, 'Particles').length, 5, 'confetti goes off with every title');
  row(bursts, 'Particles').forEach((clip, i) => {
    assert.equal(Math.round(clip.timelineStart * 30), bursts.shots[i].textF);
  });
  assert.equal(row(buildPiece(planFor({ particles: 'none' })).built, 'Particles').length, 0);

  const snow = PARTICLE_PRESETS.find((p) => p.id === 'snow').params;
  assert.deepEqual(scaledParams(snow, { width: 1920, height: 1080 }), snow);
  const big = scaledParams(snow, { width: 3840, height: 2160 });
  assert.deepEqual([big.size, big.speed, big.turbulence], [snow.size * 2, snow.speed * 2, 220]);
  assert.deepEqual([big.rate, big.lifetime, big.spread], [snow.rate, snow.lifetime, snow.spread]);
  assert.equal(scaledParams(snow, { width: 1280, height: 720 }).size, 17.33);
});

test('a look grades the background, unless it is pure glow: then it lights the title', () => {
  const graded = buildPiece(planFor({ theme: 'paper', scene: { look: 'cinematic' } })).built;
  for (const clip of [...row(graded, 'Background A'), ...row(graded, 'Background B')]) {
    const types = clip.effects.filter((fx) => fx.effectId.startsWith('look')).map((fx) => fx.type);
    assert.deepEqual(types, ['colorAdjust', 'vignette', 'grain']);
    assert.ok(
      clip.effects.findIndex((fx) => fx.type === 'wipe') !== 0,
      'graded before it is wiped',
    );
  }
  assert.ok(row(graded, 'Titles').every((clip) => clip.effects.length === 0));
  const neon = buildPiece(planFor({ theme: 'paper', scene: { look: 'neon' } })).built;
  assert.ok(row(neon, 'Titles').every((clip) => clip.effects.every((fx) => fx.type === 'glow')));
  assert.ok(row(neon, 'Titles').every((clip) => clip.effects.length === 2));
  for (const clip of [...row(neon, 'Background A'), ...row(neon, 'Background B')]) {
    assert.ok(clip.effects.every((fx) => fx.type === 'wipe'));
  }
  const plain = buildPiece(planFor({ theme: 'noir', scene: { look: 'none', transition: 'fade' } }));
  assert.ok(clipsOf(plain.built).every((clip) => clip.effects.length === 0));
});

test('the same plan and options give the same piece; the seed changes it', () => {
  const plan = planFor({ theme: 'forest', seed: 9 });
  const one = buildPiece(plan, { seed: 9 }).built;
  assert.deepEqual(withoutIds(buildPiece(plan, { seed: 9 }).built), withoutIds(one));
  assert.notDeepEqual(withoutIds(buildPiece(plan, { seed: 10 }).built), withoutIds(one));
  assert.deepEqual(
    withoutIds(buildPiece(plan, { seed: 'take two' }).built),
    withoutIds(buildPiece(plan, { seed: 'take two' }).built),
  );
});

test('odd frame rates, a single scene and many scenes all build validly', () => {
  for (const fps of [5, 12, 23.976, 50, 60]) {
    const format = { fps, width: 1280, height: 720 };
    for (const theme of [THEMES[0].id, THEMES[3].id, THEMES[6].id]) {
      const { result, built } = buildPiece(planFor({ theme, seed: 2 }), { format, pacing: 'fast' });
      assert.deepEqual(checkResult(result, { fps }), [], `${theme} at ${fps} fps`);
      assert.deepEqual(mergePiece(result, format).problems, [], `${theme} at ${fps} fps`);
      assert.ok(clipsOf(built).every((clip) => clip.timelineEnd > clip.timelineStart));
    }
  }
  const single = buildPiece(planFor({ brief: 'Only this' }));
  assert.equal(clipsOf(single.built).filter((c) => c.text.content).length, 1);
  assert.deepEqual(mergePiece(single.result, single.format).problems, []);
  const many = buildPiece(planFor({ brief: `${BRIEF}\n`.repeat(8), theme: 'neon' }), {
    duration: 40,
  });
  assert.equal(many.built.shots.length, 40);
  assert.equal(many.built.seconds, 40);
  assert.deepEqual(checkResult(many.result, { fps: 30 }), []);
  assert.deepEqual(mergePiece(many.result, many.format).problems, []);
});
