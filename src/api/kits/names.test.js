import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RESERVED_IDS } from './limits.js';
import { fileKind, parseRef, plainFileName, safeFileName } from './names.js';

describe('kit names', () => {
  it('reads library ids, built-in kits and a project’s own kit', () => {
    assert.deepEqual(parseRef('acme'), { source: 'library', id: 'acme', ref: 'acme' });
    assert.deepEqual(parseRef('builtin:bold'), {
      source: 'builtin',
      id: 'bold',
      ref: 'builtin:bold',
    });
    assert.deepEqual(parseRef('project'), { source: 'project', id: 'project', ref: 'project' });
    // The bare name of a built-in kit means the built-in kit: the library cannot hold one.
    assert.deepEqual(parseRef('clean'), { source: 'builtin', id: 'clean', ref: 'builtin:clean' });
    assert.equal(parseRef('builtin:nope').ref, 'builtin:nope');
    assert.deepEqual(RESERVED_IDS, ['project', 'clean', 'bold', 'documentary', 'playful']);
  });

  it('refuses everything that cannot name a kit', () => {
    const hostile = [
      '',
      '.',
      '..',
      '../x',
      'a/b',
      'a\\b',
      '/etc',
      'a b',
      'builtin:',
      'builtin:../x',
    ];
    for (const value of [...hostile, 'x'.repeat(41), '-a', 'a\0b', 7, null, undefined, {}, ['a']]) {
      assert.equal(parseRef(value), null, JSON.stringify(value));
    }
  });

  it('reduces a file name to a safe base name', () => {
    const cases = {
      'logo.png': 'logo.png',
      'Logo Final (2).PNG': 'Logo Final -2-.png',
      '../../etc/evil.png': 'evil.png',
      '/etc/passwd.png': 'passwd.png',
      'C:\\Users\\me\\mark.webp': 'mark.webp',
      '..\\..\\boot.gif': 'boot.gif',
      '.hidden.png': 'hidden.png',
      '...png': '',
      'fonts/Acme Sans-Bold.woff2': 'Acme Sans-Bold.woff2',
      'Überschrift.ttf': 'Überschrift.ttf',
      'a\0b.png': 'a-b.png',
      'tab\tname\n.jpg': 'tab-name-.jpg',
      'nul.png': '_nul.png',
      'kit.json': '',
      'script.js': '',
      'logo.svg': '',
      'page.html': '',
      noextension: '',
      '.png': '',
      '': '',
      'photo.jpeg': 'photo.jpeg',
      'x.png/': 'x.png',
      'evil.png.exe': '',
      'archive.tar.otf': 'archive.tar.otf',
    };
    for (const [given, wanted] of Object.entries(cases)) {
      assert.equal(safeFileName(given), wanted, JSON.stringify(given));
    }
    for (const value of [null, undefined, 3, {}, ['a.png']]) assert.equal(safeFileName(value), '');
    const long = safeFileName(`${'n'.repeat(300)}.woff2`);
    assert.equal(long.length, 100);
    assert.ok(long.endsWith('n.woff2'));
  });

  it('knows a plain file name from a path', () => {
    assert.equal(plainFileName('logo@2x.png'), 'logo@2x.png');
    for (const value of [
      'a/b.png',
      '..\\b.png',
      '../b.png',
      '.b.png',
      'b.txt',
      'b',
      '',
      'a\0.png',
      5,
    ])
      assert.equal(plainFileName(value), '', JSON.stringify(value));
    assert.deepEqual(
      ['a.PNG', 'a.jpg', 'a.woff2', 'a.OTF', 'a.svg', 'a', 'a.png.sh'].map(fileKind),
      ['picture', 'picture', 'font', 'font', '', '', ''],
    );
  });
});
