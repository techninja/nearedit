import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INKS, contrastRatio, isReadable, luminance, readableOn, withOpacity } from './color.js';

describe('brand colour arithmetic', () => {
  it('knows how bright a colour is', () => {
    assert.equal(luminance('#000000'), 0);
    assert.ok(Math.abs(luminance('#ffffff') - 1) < 1e-9);
    assert.ok(luminance('#00ff00') > luminance('#ff0000'));
    assert.ok(luminance('#ff0000') > luminance('#0000ff'));
    assert.equal(luminance('not a colour'), 0);
    assert.equal(luminance('#ffffff80'), luminance('#ffffff'), 'alpha plays no part');
  });

  it('measures contrast as WCAG does', () => {
    assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 1e-9);
    assert.equal(contrastRatio('#336699', '#336699'), 1);
    assert.equal(contrastRatio('#123456', '#fedcba'), contrastRatio('#fedcba', '#123456'));
    // A known pair: #767676 on white is the classic 4.54:1.
    assert.ok(Math.abs(contrastRatio('#767676', '#ffffff') - 4.54) < 0.01);
    assert.equal(isReadable('#767676', '#ffffff'), true);
    assert.equal(isReadable('#777777', '#ffffff'), false);
    assert.equal(isReadable('#777777', '#ffffff', 3), true);
  });

  it('picks black or white, whichever reads', () => {
    assert.equal(readableOn('#ffffff'), INKS.dark);
    assert.equal(readableOn('#facc15'), INKS.dark, 'black on yellow');
    assert.equal(readableOn('#000000'), INKS.light);
    assert.equal(readableOn('#2563eb'), INKS.light, 'white on a deep blue');
    assert.equal(readableOn('#1f1d3d'), INKS.light);
    for (const ground of ['#e6226f', '#6d4aff', '#c9a561', '#0d0c0a', '#808080']) {
      const ink = readableOn(ground);
      const other = ink === INKS.dark ? INKS.light : INKS.dark;
      assert.ok(contrastRatio(ink, ground) >= contrastRatio(other, ground), ground);
      assert.ok(contrastRatio(ink, ground) >= 4.5, `${ink} on ${ground} reads`);
    }
  });

  it('gives a colour another opacity', () => {
    assert.equal(withOpacity('#336699', 0.5), '#33669980');
    assert.equal(withOpacity('#369', 1), '#336699ff');
    assert.equal(withOpacity('#33669980', 0), '#33669900');
    assert.equal(withOpacity('teal', 0.5), 'teal', 'what is not a hex colour is left alone');
  });
});
