import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_KITS, builtinKit, normalizeKit, resolveKit } from '#utils/brand/index.js';
import { TEXT_ANIMATIONS, TEXT_UNITS } from '#utils/compose/index.js';
import { contrast } from '../motion/color.js';
import * as vocab from '../motion/vocab.js';
import { BRAND, brandTheme, themeFonts } from './theme.js';

const kitOf = (id) => resolveKit(builtinKit(id));
const custom = (tokens, fonts = []) =>
  resolveKit([normalizeKit({ id: 'acme', name: 'Acme', extends: 'builtin:clean', tokens, fonts })]);

test('a kit becomes a theme: colours by role, the two fonts, the kit’s motion', () => {
  const kit = kitOf('bold');
  const theme = brandTheme(kit);
  assert.equal(theme.id, BRAND);
  assert.equal(theme.label, 'Bold');
  assert.deepEqual([theme.ink, theme.accent], ['#ffffff', '#facc15'], 'text and primary');
  assert.deepEqual(
    [theme.title.fontFamily, theme.title.upper, theme.subtitle.fontFamily],
    ['Bebas Neue', true, 'Inter'],
  );
  assert.ok(
    Math.abs(theme.title.size - 0.15 * 1.3) < 1e-9,
    'the size follows the font’s correction',
  );
  assert.deepEqual(theme.animations, [['slide-right', 'block']], 'wipe, by block');
  assert.deepEqual(theme.transitions, ['wipe', 'fade']);
  assert.equal(theme.stroke, 0.008, 'the kit’s line thickness, 0.8 units');
  assert.equal(brandTheme(kit), theme, 'the same kit, the same theme');
});

test('every built-in kit gives a theme the builder can use, readable on all its grounds', () => {
  for (const { id } of BUILTIN_KITS) {
    const theme = brandTheme(kitOf(id));
    const names = vocab.vocabulary();
    for (const tone of theme.backdrops.flat()) {
      assert.ok(contrast(theme.ink, tone) >= 4.5, `${id}: ink on ${tone}`);
      assert.ok(contrast(theme.sub, tone) >= 4.5, `${id}: sub on ${tone}`);
    }
    assert.equal(theme.backdrops.length, 3);
    for (const name of theme.backgrounds)
      assert.ok(names.background.includes(name), `${id} ${name}`);
    for (const name of theme.accents) assert.ok(names.accent.includes(name), `${id} ${name}`);
    for (const name of theme.transitions)
      assert.ok(names.transition.includes(name), `${id} ${name}`);
    for (const [animation, by] of theme.animations) {
      assert.ok(
        TEXT_ANIMATIONS.includes(animation) && TEXT_UNITS.includes(by),
        `${id} ${animation}`,
      );
    }
    assert.deepEqual(theme.particles, ['none']);
    assert.ok(vocab.FONTS.includes(theme.title.fontFamily), 'built-in kits use bundled fonts');
  }
  // A light kit is a light theme: no shadow under dark ink, a pattern for round corners.
  const playful = brandTheme(kitOf('playful'));
  assert.deepEqual(
    [playful.shadow, playful.backgrounds[0], playful.ink],
    [false, 'dots', '#1f1d3d'],
  );
  assert.equal(brandTheme(kitOf('clean')).shadow, true);
});

test('colours a kit got wrong are put right, never the brand’s own text colour when it reads', () => {
  // Text that cannot be read on the background: black or white, whichever reads.
  const grey = brandTheme(custom({ color: { background: '#777777', text: '#808080' } }));
  for (const tone of grey.backdrops.flat()) assert.ok(contrast(grey.ink, tone) >= 4.5);
  // A primary so close to the text that tinting with it would drown the text: the tint gives way.
  const loud = brandTheme(custom({ color: { background: '#101010', primary: '#fafafa' } }));
  for (const tone of loud.backdrops.flat()) assert.ok(contrast(loud.ink, tone) >= 4.5);
  assert.equal(loud.ink, '#ffffff');
  // Muted text too weak for its grounds moves towards the text colour.
  const faint = brandTheme(custom({ color: { muted: '#3b4252' } }));
  for (const tone of faint.backdrops.flat()) assert.ok(contrast(faint.sub, tone) >= 4.5);
  assert.notEqual(faint.sub, '#3b4252');
});

test('a font of the kit’s own is the theme’s font, and its files are named', () => {
  const face = { family: 'Acme Sans', weight: 700, file: '/kits/acme/AcmeSans-Bold.woff2' };
  const kit = custom({ font: { heading: { family: 'Acme Sans', weight: 700 } } }, [face]);
  const theme = brandTheme(kit);
  assert.equal(theme.title.fontFamily, 'Acme Sans');
  assert.deepEqual(
    themeFonts(kit, theme).map((entry) => [entry.family, entry.file]),
    [['Acme Sans', '/kits/acme/AcmeSans-Bold.woff2']],
  );
  assert.deepEqual(themeFonts(kitOf('clean'), brandTheme(kitOf('clean'))), []);
});

test('the kit’s motion tokens choose how text arrives and how scenes change', () => {
  const by = (motion) => brandTheme(custom({ motion }));
  assert.deepEqual(by({ enter: 'type', by: 'word' }).animations, [['typewriter', 'char']]);
  assert.deepEqual(by({ enter: 'scale', by: 'char' }).transitions, ['iris', 'fade']);
  assert.deepEqual(by({ enter: 'fade', by: 'line' }).transitions, ['fade']);
  assert.deepEqual(by({ enter: 'none' }).animations[0][0], 'none');
  assert.deepEqual(brandTheme(custom({ shape: { stroke: 0 } })).accents, ['none']);
  assert.deepEqual(brandTheme(custom({ shape: { radius: 4 } })).accents, ['rule', 'ring', 'none']);
});
