import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, gen, title } from '../../../../tests/compose/build.js';
import { draw, near } from '../../../../tests/compose/pixels.js';
import { createEnv } from '../../../api/compose/index.js';

const BOX = '#0000ff';
const isBox = (r, g, b) => b > 200 && r < 60 && g < 60;
const isInk = (r, g, b) => r > 200 && g > 200 && b > 200;
const isRed = (r, g, b) => r > 180 && g < 70 && b < 70;
/** One title over black; the canvas is a quarter of the 1920×1080 output. */
const shot = (content, text = {}, extra = {}, time = 1) =>
  draw(doc([[title('t', content, text, extra)]]), time);
const size = (box) => [box.right - box.left + 1, box.bottom - box.top + 1];
const about = (actual, expected, tolerance, message) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual}, want ${expected} ±${tolerance}`,
  );

describe('title layout on the canvas', () => {
  it('centres the block and pads its box by a quarter of the font size', () => {
    const box = shot('Hello', { fontSize: 160, background: BOX, color: BOX }).bounds(isBox);
    about((box.left + box.right + 1) / 2, 240, 1, 'horizontal centre');
    about((box.top + box.bottom + 1) / 2, 135, 1, 'vertical centre');
    // One line: 1.2 × 160 high plus 2 × 40 padding, at a quarter scale.
    about(size(box)[1], (160 * 1.2 + 80) / 4, 1, 'box height');
  });

  it('pitches lines 1.2 × the font size apart, or by lineHeight', () => {
    const height = (content, text) =>
      size(shot(content, { fontSize: 100, background: BOX, color: BOX, ...text }).bounds(isBox))[1];
    about(height('a\nb\nc'), (3 * 120 + 50) / 4, 1, 'three lines');
    about(height('a\nb\nc', { lineHeight: 2 }), (3 * 200 + 50) / 4, 1, 'double spaced');
    about(height('a', { boxPadding: 1 }), (120 + 200) / 4, 1, 'padding of one font size');
  });

  it('draws the text inside the box, in its colour, with its font', () => {
    const frame = shot('Hello', { fontSize: 200, background: BOX });
    const [box, ink] = [frame.bounds(isBox), frame.bounds(isInk)];
    assert.ok(
      ink.left > box.left && ink.right < box.right && ink.top > box.top && ink.bottom < box.bottom,
    );
    about((ink.left + ink.right) / 2, 240, 2, 'ink centre');
    const bold = shot('Hello', { fontSize: 200, bold: true }).count(isInk);
    const regular = shot('Hello', { fontSize: 200, bold: false }).count(isInk);
    assert.ok(bold > regular * 1.15, `bold has more ink: ${bold} vs ${regular}`);
    const serif = shot('Hello', { fontSize: 200, fontFamily: 'Playfair Display' });
    assert.notDeepEqual(serif.data, shot('Hello', { fontSize: 200 }).data);
  });

  it('aligns shorter lines left, centre or right within the block', () => {
    const line = (align) => {
      const frame = shot('WWWWWWWW\nii', { fontSize: 120, align });
      const all = frame.bounds(isInk);
      const rows = [];
      for (let x = 0; x < frame.width; x++) if (isInk(...frame.at(x, all.bottom - 4))) rows.push(x);
      return { all, left: rows[0], right: rows[rows.length - 1] };
    };
    const [l, c, r] = ['left', 'center', 'right'].map(line);
    about(l.left, l.all.left, 3, 'left edge');
    about(r.right, r.all.right, 3, 'right edge');
    about((c.left + c.right) / 2, 240, 2, 'centred');
  });

  it('wraps at maxWidth and breaks a word that cannot fit', () => {
    const text = { fontSize: 80, background: BOX, color: BOX };
    const free = size(shot('several words that wrap around', text).bounds(isBox));
    const wrapped = size(
      shot('several words that wrap around', { ...text, maxWidth: 600 }).bounds(isBox),
    );
    assert.ok(wrapped[0] <= (600 + 40) / 4 + 1 && wrapped[0] < free[0], `width ${wrapped[0]}`);
    about(wrapped[1], (3 * 96 + 40) / 4, 1, 'three lines');
    const broken = size(shot('Supercalifragilistic', { ...text, maxWidth: 300 }).bounds(isBox));
    assert.ok(broken[0] <= (300 + 40) / 4 + 1 && broken[1] > (2 * 96) / 4, `${broken}`);
  });

  it('widens with letter spacing and rounds the box', () => {
    const plain = size(
      shot('Spaced', { fontSize: 120, background: BOX, color: BOX }).bounds(isBox),
    );
    const spaced = size(
      shot('Spaced', { fontSize: 120, background: BOX, color: BOX, letterSpacing: 40 }).bounds(
        isBox,
      ),
    );
    about(spaced[0] - plain[0], (5 * 40) / 4, 1, 'five gaps of 40 px');
    const round = shot('Hello', { fontSize: 160, background: BOX, color: BOX, boxRadius: 60 });
    const box = round.bounds(isBox);
    assert.ok(!isBox(...round.at(box.left + 1, box.top + 1)), 'the corner is cut');
    assert.ok(isBox(...round.at(box.left + 1, 135)));
  });
});

describe('title outline, shadow and fades', () => {
  it('outlines outside the glyphs', () => {
    const plain = shot('O', { fontSize: 400 });
    const outlined = shot('O', { fontSize: 400, outlineWidth: 16, outlineColor: '#ff0000' });
    assert.ok(outlined.count(isRed) > 500);
    about(
      outlined.count(isInk),
      plain.count(isInk),
      plain.count(isInk) * 0.03,
      'the fill is not eaten',
    );
    const [p, o] = [plain.bounds(isInk), outlined.bounds((r) => r > 180)];
    about(p.left - o.left, 4, 1.5, 'outline width at a quarter scale');
  });

  it('casts one drop shadow, offset and blurred in output pixels', () => {
    const base = { fontSize: 300, color: '#ffffff' };
    const over = (text) =>
      draw(doc([[title('t', 'T', text)], [gen('bg', 'solid', { color: '#808080' })]]));
    const dark = (r) => r < 100;
    assert.equal(over(base).count(dark), 0);
    const hard = over({ ...base, shadowColor: '#000000', shadowX: 40, shadowY: 40 });
    const ink = hard.bounds(isInk);
    const shade = hard.bounds(dark);
    about(shade.right - ink.right, 10, 1.5, 'shadow offset x');
    about(shade.bottom - ink.bottom, 10, 1.5, 'shadow offset y');
    const soft = over({
      ...base,
      shadowColor: '#000000',
      shadowX: 40,
      shadowY: 40,
      shadowBlur: 40,
    });
    assert.ok(soft.count((r) => r > 100 && r < 127) > 200, 'a blurred edge');
  });

  it('fades as one picture: the outline never shows through the fill', () => {
    const text = { fontSize: 500, color: '#00ff00', outlineWidth: 30, outlineColor: '#ff0000' };
    const solid = shot('I', text);
    const faded = shot('I', text, { transform: { opacity: 0.5 } });
    // Just inside the glyph edge, where the inner half of the outline lies under the fill.
    const fill = solid.bounds((r, g) => g > 200 && r < 50);
    const [x, y] = [fill.left + 2, Math.round((fill.top + fill.bottom) / 2)];
    assert.deepEqual(solid.at(x, y), [0, 255, 0]);
    assert.ok(near(faded.at(x, y), [0, 128, 0], 2), `the fill alone at half: ${faded.at(x, y)}`);
    assert.ok(near(faded.at(fill.left - 3, y), [128, 0, 0], 2), 'the outline at half');
  });

  it('follows a keyframed colour and waits for its font', () => {
    const keyed = {
      keyframes: {
        'text.color': [
          { t: 0, v: '#ff0000' },
          { t: 2, v: '#0000ff' },
        ],
      },
    };
    const frame = shot('MMM', { fontSize: 300 }, keyed, 1);
    assert.ok(
      frame.count((r, g, b) => Math.abs(r - 128) < 3 && g < 3 && Math.abs(b - 128) < 3) > 1000,
    );
    const asked = [];
    const env = createEnv();
    env.fontReady = (font, text) => asked.push([font, text]) && false;
    const edl = doc([[title('t', 'Later', { fontSize: 200, fontFamily: 'Caveat', bold: true })]]);
    assert.equal(
      draw(edl, 1, { env }).count(isInk),
      0,
      'nothing is drawn with a font that is not there',
    );
    assert.deepEqual(asked, [['700 200px "Caveat", "Noto Color Emoji"', 'Later']]);
  });

  it('draws colour emoji', () => {
    const frame = shot('🔥', { fontSize: 400 });
    const coloured = frame.count((r, g, b) => r > 200 && g > 60 && g < 220 && b < 90);
    assert.ok(coloured > 800, `an orange flame, not a blank or a grey glyph: ${coloured} px`);
  });
});

describe('title animation on the canvas', () => {
  const animated = (animateIn, animateOut) => ({ fontSize: 150, animateIn, animateOut });
  const anim = (type, extra = {}) => ({
    type,
    duration: 1,
    by: 'char',
    stagger: 0.1,
    ease: 'linear',
    ...extra,
  });
  const still = shot('Animate', { fontSize: 150 });

  it('is exactly the still title once its entrance is over and before its exit', () => {
    for (const type of ['fade', 'slide-up', 'scale', 'blur', 'typewriter']) {
      const text = animated(anim(type), anim(type));
      assert.deepEqual(shot('Animate', text, {}, 2).data, still.data, `${type} at rest`);
    }
  });

  it('types more characters as the clip ages, and erases them at the end', () => {
    const text = animated(
      anim('typewriter', { duration: 1.4, stagger: 0 }),
      anim('typewriter', { duration: 1.4, stagger: 0 }),
    );
    const ink = (time) => shot('Animate', text, {}, time).count(isInk);
    assert.equal(ink(0), 0);
    assert.ok(
      ink(0.3) > 0 && ink(0.3) < ink(0.9) && ink(0.9) < ink(1.4),
      `${ink(0.3)}, ${ink(0.9)}, ${ink(1.4)}`,
    );
    assert.equal(ink(1.4), still.count(isInk));
    assert.ok(ink(3.5) < ink(2) && ink(3.9) < ink(3.5) && ink(3.99) === 0);
    const typing = shot('Animate', text, {}, 0.5).bounds(isInk);
    assert.equal(typing.left, still.bounds(isInk).left, 'it types from the left');
    assert.ok(typing.right < still.bounds(isInk).right - 20);
  });

  it('staggers characters: the first arrive while the last are still away', () => {
    const frame = shot('Animate', animated(anim('fade')), {}, 0.8);
    const lit = frame.bounds((r) => r > 20);
    const full = frame.bounds(isInk);
    assert.ok(full && full.right < lit.right - 15, 'later letters are dimmer than the first');
    assert.ok(frame.count(isInk) < still.count(isInk));
  });

  it('slides, scales and blurs pieces into place', () => {
    const rest = still.bounds(isInk);
    const sliding = shot('Animate', animated(anim('slide-up', { by: 'block' })), {}, 0.5).bounds(
      (r) => r > 60,
    );
    about(sliding.top - rest.top, (150 * 0.5) / 4, 2, 'half a font size below its place');
    const growing = shot('Animate', animated(anim('scale', { by: 'block' })), {}, 0.5).bounds(
      (r) => r > 40,
    );
    about(size(growing)[0], size(rest)[0] / 2, 3, 'half size');
    about((growing.left + growing.right) / 2, 240, 2, 'about the block centre');
    const blurry = shot('Animate', animated(anim('blur', { by: 'block' })), {}, 0.5);
    assert.ok(blurry.count(isInk) < still.count(isInk) / 2 && blurry.count((r) => r > 10) > 0);
    const leaving = shot(
      'Animate',
      animated(undefined, anim('slide-up', { by: 'block' })),
      {},
      3.5,
    ).bounds((r) => r > 60);
    about(rest.top - leaving.top, (150 * 0.5) / 4, 2, 'half a font size above, on the way out');
  });

  it('places single characters exactly where the whole line draws them', () => {
    // Almost at the end of a slide every character is drawn on its own, a hair from rest.
    const text = animated(anim('slide-up', { stagger: 0, duration: 1 }));
    const nearly = shot('AV To Wavy', text, {}, 0.9999);
    const whole = shot('AV To Wavy', { fontSize: 150 });
    let sum = 0;
    for (let i = 0; i < whole.data.length; i++) sum += Math.abs(whole.data[i] - nearly.data[i]);
    assert.ok(sum / whole.data.length < 0.05, `mean difference ${sum / whole.data.length}`);
  });
});
