import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutText, textStyle } from '#utils/compose/index.js';
import { THEMES, getTheme, themeIds } from '#utils/director/motion/themes.js';
import { MARGIN, composeScene } from './layout.js';
import { serverMeasure } from './measure.js';
import { FORMATS, buildPiece, planFor, row } from './testkit.js';
import { fitText } from './typeset.js';

const measure = serverMeasure();

/** The box a title clip's text occupies, in output pixels from the frame's top left. */
function drawnBox(clip, format) {
  const style = textStyle(clip.text);
  const layout = layoutText(style, (run) => measure(style, run));
  const cx = format.width / 2 + clip.transform.x;
  const cy = format.height / 2 + clip.transform.y;
  return {
    left: cx - layout.width / 2,
    right: cx + layout.width / 2,
    top: cy - layout.height / 2,
    bottom: cy + layout.height / 2,
    lines: layout.lines.map((line) => line.text),
    width: layout.width,
  };
}

test('the server measures text with the bundled faces', () => {
  const inter = { fontFamily: 'Inter', fontSize: 100, weight: 400 };
  const width = measure(inter, 'Hamburgefonstiv');
  assert.ok(width > 500 && width < 1000, `Inter at 100px measured ${width}`);
  assert.ok(measure({ ...inter, weight: 900 }, 'Hamburgefonstiv') > width, 'heavier is wider');
  assert.ok(measure({ ...inter, letterSpacing: 10 }, 'abc') > measure(inter, 'abc') + 25);
  assert.ok(Math.abs(measure({ ...inter, fontSize: 50 }, 'Hamburgefonstiv') - width / 2) < 1);
  const mono = { fontFamily: 'JetBrains Mono', fontSize: 80, weight: 400 };
  assert.equal(measure(mono, 'iiii'), measure(mono, 'MMMM'));
});

test('fitText: the largest size that fits, lines evened out, no word broken', () => {
  const font = getTheme('pop').title;
  const box = { width: 900, height: 600, lines: 3, size: 180, min: 50 };
  const short = fitText('Hello', font, box, measure);
  assert.deepEqual([short.fontSize, short.lines, short.fits], [180, 1, true]);

  const long = fitText('A much longer line that has to wrap onto lines', font, box, measure);
  assert.ok(long.fits && long.lines === 3 && long.fontSize < 180 && long.fontSize >= 50);
  assert.ok(long.width <= 900 && long.height <= 600);
  const style = textStyle({
    ...long.text,
    content: 'A much longer line that has to wrap onto lines',
  });
  const lines = layoutText(style, (run) => measure(style, run)).lines;
  assert.equal(lines.length, 3, 'the stored maxWidth wraps as measured');
  const widths = lines.map((line) => line.width);
  assert.ok(Math.min(...widths) > Math.max(...widths) * 0.6, `uneven lines: ${widths}`);
  // The balanced wrap never needs more room than the box gave.
  assert.ok(long.text.maxWidth <= 900);

  const word = fitText('Internationalisation', font, box, measure);
  assert.ok(word.fits && word.lines === 1 && word.width <= 900, 'shrunk until the word fits');
  const monster = fitText('x'.repeat(120), font, box, measure);
  assert.equal(monster.fits, false);
  assert.equal(monster.fontSize, 50);
  assert.equal(fitText('Left', font, box, measure, 'left').text.align, 'left');
});

test('in every theme and frame shape the words stay inside the picture', () => {
  for (const theme of themeIds()) {
    for (const format of FORMATS) {
      for (const seed of [1, 5]) {
        const plan = planFor({ theme, seed, scene: { accent: 'rule' } });
        const { built } = buildPiece(plan, { format, seed });
        const where = `${theme} ${format.name} ${plan.align}`;
        const inset = format.width * (MARGIN - 0.005);
        const titles = row(built, 'Titles').map((clip) => drawnBox(clip, format));
        const subtitles = row(built, 'Text');
        for (const [i, box] of titles.entries()) {
          assert.ok(box.left >= inset && box.right <= format.width - inset, `${where}: title ${i}`);
          assert.ok(box.top >= format.height * 0.1, `${where}: title ${i} too high`);
          assert.ok(box.bottom <= format.height * 0.9, `${where}: title ${i} too low`);
          assert.ok(box.lines.length <= 4, `${where}: ${box.lines.length} lines`);
          const words = plan.scenes[i].title.split(' ');
          assert.deepEqual(box.lines.join(' ').split(' '), words, `${where}: a word was broken`);
        }
        for (const clip of subtitles) {
          const sub = drawnBox(clip, format);
          const title =
            titles[row(built, 'Titles').findIndex((t) => t.timelineEnd === clip.timelineEnd)];
          assert.ok(sub.left >= inset && sub.right <= format.width - inset, `${where}: subtitle`);
          assert.ok(sub.bottom <= format.height * 0.92, `${where}: subtitle too low`);
          assert.ok(sub.top >= title.bottom, `${where}: subtitle runs into its title`);
          assert.ok(clip.text.fontSize < title.width, 'sanity');
          if (plan.align === 'left')
            assert.ok(Math.abs(sub.left - title.left) < 1, 'one left edge');
          else assert.ok(Math.abs(sub.left + sub.right - title.left - title.right) < 1, 'centred');
        }
        // Readable: never smaller than 2.6% of the frame's shorter side.
        const short = Math.min(format.width, format.height);
        for (const clip of [...row(built, 'Titles'), ...subtitles]) {
          assert.ok(clip.text.fontSize >= short * 0.026, `${where}: ${clip.text.fontSize}px`);
        }
      }
    }
  }
});

test('a rule sits between title and subtitle, clear of both; a frame stays inside', () => {
  for (const format of FORMATS) {
    for (const align of /** @type {const} */ (['center', 'left'])) {
      const scene = { title: 'Keyframes, eased', subtitle: 'every number can move' };
      const text = composeScene(scene, THEMES[0], format, align, measure, true);
      const titleBottom = text.title.y + text.title.fitted.height / 2;
      const subtitleTop = text.subtitle.y - text.subtitle.fitted.height / 2;
      assert.ok(text.rule.y - text.rule.thickness / 2 >= titleBottom, `${format.name} ${align}`);
      assert.ok(text.rule.y + text.rule.thickness / 2 <= subtitleTop, `${format.name} ${align}`);
      assert.ok(text.rule.width > 40 && text.rule.width <= text.group.width);
      if (align === 'left') {
        assert.ok(Math.abs(text.rule.x - (text.title.x - text.title.fitted.width / 2)) < 1);
      }
      const plan = planFor({ theme: 'blueprint', scene: { accent: 'frame' } });
      for (const clip of row(buildPiece(plan, { format }).built, 'Accents')) {
        const { widthPx, heightPx, strokeWidth } = clip.generator.params;
        const keys = Object.values(clip.keyframes).flat();
        assert.ok(widthPx + strokeWidth < format.width && heightPx + strokeWidth < format.height);
        assert.ok(keys.every((key) => key.v + strokeWidth < Math.max(format.width, format.height)));
        const [w, h] = ['widthPx', 'heightPx'].map((p) => clip.keyframes[`generator.params.${p}`]);
        assert.ok(
          w.every((key) => key.v < format.width) && h.every((key) => key.v < format.height),
        );
      }
    }
  }
});

test('text too long to fit readably is reported, and still wrapped inside the frame', () => {
  const brief = `${'Supercalifragilistic '.repeat(6)}| ${'and then some more words '.repeat(8)}`;
  for (const format of FORMATS) {
    const { built } = buildPiece(planFor({ theme: 'pop', brief }), { format });
    const [title] = row(built, 'Titles');
    const box = drawnBox(title, format);
    assert.ok(box.left >= 0 && box.right <= format.width, `${format.name}: ${box.left}`);
    assert.ok(box.top >= 0 && box.bottom <= format.height);
    if (format.width < 1500) assert.match(built.notes.join(' '), /Scene 1: the text is too long/);
  }
});
