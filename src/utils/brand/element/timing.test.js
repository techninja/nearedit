import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { animationSpan, textAnimation as normalised } from '#utils/compose/text/animation.js';
import { valueAt } from '#utils/edl/animate.js';
import { wipeRange } from './motionGeometry.js';
import { pieceCount, textAnimation } from './textClip.js';
import { FONT, WIDE, expand, square } from './testkit.js';

const near = (a, b, slack = 1e-6) => Math.abs(a - b) <= slack;
const text = (id, more) => ({ id, type: 'text', text: 'one two three four', font: FONT, ...more });
const MOVING = {
  layers: [
    square('late', {
      enter: { motion: 'fade', delay: 0.3, duration: 0.4 },
      exit: { motion: 'fade', delay: 0.2, duration: 0.5 },
    }),
    square('slide', { enter: 'slide-up', exit: 'slide-up' }),
    text('words', {
      enter: { motion: 'slide-up', delay: 0.1, duration: 0.6, by: 'word' },
      exit: 'fade',
    }),
  ],
};

describe('motion is timed from the start and from the end', () => {
  it('whatever the length: two seconds, twenty, or ten minutes', () => {
    for (const duration of [2, 5, 20, 600]) {
      const { by } = expand(MOVING, {}, { duration });
      assert.deepEqual([by.late.timelineStart, by.late.fadeIn], [0.3, 0.4]);
      assert.ok(near(by.late.timelineEnd, duration - 0.2) && by.late.fadeOut === 0.5);
      assert.deepEqual([by.slide.timelineStart, by.slide.timelineEnd], [0, duration]);
      const y = by.slide.keyframes['transform.y'].map((key) => [key.t, key.v]);
      assert.deepEqual(y[0], [0, 43.2], 'from four units below');
      assert.deepEqual(y[1], [0.5, 0]);
      assert.ok(near(y[2][0], duration - 0.35) && y[2][1] === 0);
      assert.deepEqual(y[3], [duration, -43.2], 'and on up, out by the far side');
      assert.equal(by.words.timelineStart, 0.1);
      assert.equal(by.words.timelineEnd, duration);
      assert.equal(by.words.text.animateOut.duration, 0.35);
      // Keyframe times are the element's own seconds: the source window starts with the clip.
      for (const clip of Object.values(by)) assert.equal(clip.sourceIn, clip.timelineStart);
    }
  });

  it('an element too short for its motions has them shortened in proportion', () => {
    // Entrances end at 0.7 s, exits take 0.7 s: together 1.4 s.
    for (const duration of [1.4, 1, 0.5, 0.1, 1 / 30]) {
      const k = Math.min(1, duration / 1.4);
      const { by, clips } = expand(MOVING, {}, { duration });
      assert.ok(near(by.late.timelineStart, 0.3 * k) && near(by.late.fadeIn, 0.4 * k));
      assert.ok(near(by.late.timelineEnd, duration - 0.2 * k) && near(by.late.fadeOut, 0.5 * k));
      for (const clip of clips) {
        assert.ok(clip.timelineStart >= 0 && clip.timelineEnd <= duration + 1e-9);
        assert.ok(
          clip.fadeIn + clip.fadeOut <= clip.timelineEnd - clip.timelineStart + 1e-9,
          'fades fit',
        );
        for (const keys of Object.values(clip.keyframes)) {
          for (let i = 1; i < keys.length; i++)
            assert.ok(keys[i].t - keys[i - 1].t > 1e-6, 'keys in order');
        }
      }
    }
  });

  it("the kit's speed divides every time, and its ease and unit are the defaults", () => {
    const fast = expand({ ...MOVING, motion: { speed: 2, by: 'char', ease: 'back-out' } }).by;
    assert.deepEqual(
      [fast.late.timelineStart, fast.late.fadeIn, fast.late.fadeOut],
      [0.15, 0.2, 0.25],
    );
    assert.equal(fast.slide.keyframes['transform.y'][0].ease, 'back-out');
    assert.equal(
      fast.slide.keyframes['transform.y'][2].ease,
      'ease-in',
      'an exit accelerates away',
    );
    const typed = expand({ motion: { by: 'char' }, layers: [text('t', { enter: 'fade' })] }).by.t;
    assert.equal(typed.text.animateIn.by, 'char');
    assert.equal(typed.text.animateOut.type, 'none');
  });
});

describe('text motion', () => {
  it('is the compositor’s own text animation, the whole entrance inside its time', () => {
    const { words } = expand(MOVING).by;
    const { animateIn, animateOut } = words.text;
    assert.deepEqual(
      [animateIn.type, animateIn.by, animateOut.type, animateOut.by],
      ['slide-up', 'word', 'fade', 'block'],
    );
    const span = animationSpan(normalised(animateIn), pieceCount(words.text.content, 'word'));
    assert.ok(span <= 0.6 + 1e-9 && span > 0.4, `the entrance takes ${span} of its 0.6 s`);
    for (const count of [1, 2, 9, 40, 400]) {
      const content = Array.from({ length: count }, (_, i) => `w${i}`).join(' ');
      for (const by of ['block', 'line', 'word', 'char']) {
        for (const motion of ['fade', 'scale', 'blur', 'type', 'slide-left']) {
          const anim = textAnimation({ motion, from: 1, to: 1.8, by, ease: 'ease-out' }, content);
          const pieces = pieceCount(content, anim.by);
          assert.ok(
            animationSpan(normalised(anim), pieces) <= 0.8 + 1e-6,
            `${motion} by ${by}, ${count} words`,
          );
        }
      }
    }
    assert.equal(textAnimation(null, 'x').type, 'none');
    assert.equal(
      textAnimation({ motion: 'wipe', from: 0, to: 1, by: 'word' }, 'x').type,
      'none',
      'a wipe is an effect',
    );
    assert.equal(textAnimation({ motion: 'type', from: 0, to: 1, by: 'block' }, 'abc').by, 'char');
  });

  it('counts the pieces the compositor will move', () => {
    assert.deepEqual(
      ['block', 'line', 'word', 'char'].map((by) => pieceCount('Ada Love\nlace 👍🏽', by)),
      [1, 2, 4, 12],
    );
  });
});

describe('motion of shapes and pictures', () => {
  it('scales a shape by its own size, a picture by its transform', () => {
    const { by } = expand({
      layers: [
        square('pop', {
          radius: 2,
          stroke: '#000000',
          strokeWidth: 0.5,
          enter: { motion: 'scale', duration: 0.4, ease: 'back-out' },
          exit: 'scale',
        }),
        { id: 'logo', type: 'image', src: '/logo.png', at: 'top-left', h: 10, enter: 'scale' },
      ],
    });
    const grown = Object.keys(by.pop.keyframes);
    assert.deepEqual(
      grown,
      ['widthPx', 'heightPx', 'radius', 'strokeWidth'].map((name) => `generator.params.${name}`),
    );
    assert.deepEqual(
      by.pop.keyframes['generator.params.widthPx'].map((key) => key.v),
      [0, 108, 108, 0],
    );
    assert.ok(
      valueAt(by.pop.keyframes['generator.params.widthPx'], 0.3) > 108,
      'back-out overshoots',
    );
    assert.equal(by.pop.transform.scaleX, 1, 'its transform stays the identity');
    assert.deepEqual(Object.keys(by.logo.keyframes), ['transform.scaleX', 'transform.scaleY']);
    assert.equal(by.logo.keyframes['transform.scaleX'][0].v, 0);
  });

  it('slides from as far as the design says, or from outside the frame', () => {
    const panel = (motion) => ({
      id: 'p',
      type: 'shape',
      around: 'frame',
      fill: '#000000',
      enter: { motion, travel: 'out' },
      exit: { motion, travel: 'out' },
    });
    const keys = (motion, axis) =>
      expand({ layers: [panel(motion)] }).by.p.keyframes[`transform.${axis}`].map((key) => key.v);
    assert.deepEqual(
      keys('slide-right', 'x'),
      [-1920, 0, 0, 1920],
      'in from the left, out by the right',
    );
    assert.deepEqual(keys('slide-left', 'x'), [1920, 0, 0, -1920]);
    assert.deepEqual(keys('slide-up', 'y'), [1080, 0, 0, -1080]);
    assert.deepEqual(keys('slide-down', 'y'), [-1080, 0, 0, 1080]);
    const out = expand({ layers: [panel('slide-right')] }).by.p;
    assert.deepEqual(
      [out.fadeIn, out.fadeOut],
      [0, 0],
      'a panel that covers the frame does not fade',
    );
    const near8 = expand({ layers: [square('s', { enter: { motion: 'slide-left', travel: 8 } })] })
      .by.s;
    assert.deepEqual(
      near8.keyframes['transform.x'].map((key) => key.v),
      [86.4, 0],
    );
    assert.equal(near8.fadeIn, 0.5, 'a short slide fades as it comes');
  });

  it('wipes a layer across its own box, and only while the wipe runs', () => {
    const { clips } = expand({
      layers: [
        square('w', {
          at: 'left',
          w: 30,
          enter: { motion: 'wipe', duration: 0.4 },
          exit: { motion: 'wipe', duration: 0.3 },
        }),
      ],
    });
    assert.deepEqual(
      clips.map((clip) => clip.clipId),
      ['el-w-in', 'el-w', 'el-w-out'],
    );
    const [into, rest, out] = clips;
    assert.deepEqual(
      [into.timelineStart, into.timelineEnd, rest.timelineEnd, out.timelineEnd].map(
        (t) => Math.round(t * 100) / 100,
      ),
      [0, 0.4, 4.7, 5],
    );
    assert.deepEqual([into.effects.length, rest.effects.length, out.effects.length], [1, 0, 1]);
    assert.deepEqual(Object.keys(rest.keyframes), [], 'at rest it is a plain shape');
    assert.equal(out.effects[0].params.invert, true);
    const [hidden, shown] = wipeRange(0, 12.96, { x: 64.8, y: 486, w: 324, h: 108 }, WIDE);
    const progress = into.keyframes['effects.in.progress'];
    assert.ok(near(progress[0].v, hidden) && near(progress[1].v, shown));
    // Nothing of the box shows at `hidden`, all of it at `shown`: the edge's soft band is clear of it.
    const edge = (p) => -960 - 6.48 + p * (1920 + 12.96) + 960;
    assert.ok(edge(hidden) + 6.48 <= 64.8 + 1e-6 && edge(shown) - 6.48 >= 388.8 - 1e-6);
    assert.deepEqual(wipeRange(90, 0, { x: 0, y: 0, w: 1920, h: 1080 }, WIDE), [0, 1]);
  });

  it('motions that only text has fade on anything else; unknown ones do nothing', () => {
    const { by } = expand({
      layers: [
        square('a', { enter: 'type' }),
        square('b', { enter: 'blur' }),
        square('c', { enter: 'none', exit: { motion: 'none', delay: 1 } }),
      ],
    });
    assert.deepEqual([by.a.fadeIn, by.b.fadeIn, by.c.fadeIn], [0.5, 0.5, 0]);
    assert.equal(by.c.timelineEnd, 4, 'a layer may still leave early');
  });
});
