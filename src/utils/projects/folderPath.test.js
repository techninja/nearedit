import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { breadcrumb, folderNameProblem, rootOf } from './folderPath.js';

describe('rootOf', () => {
  it('finds the root a path lies in', () => {
    assert.equal(rootOf('/home/me/video/trip', ['/home/me', '/mnt/media']), '/home/me');
    assert.equal(rootOf('/mnt/media', ['/home/me', '/mnt/media']), '/mnt/media');
  });

  it('prefers the deepest root and does not match on a shared prefix', () => {
    assert.equal(rootOf('/home/me/video/a', ['/home/me', '/home/me/video']), '/home/me/video');
    assert.equal(rootOf('/home/me-too/a', ['/home/me']), '');
  });
});

describe('breadcrumb', () => {
  it('starts at the browse root', () => {
    assert.deepEqual(breadcrumb('/home/me/video/trip', ['/home/me']), [
      { name: 'me', path: '/home/me' },
      { name: 'video', path: '/home/me/video' },
      { name: 'trip', path: '/home/me/video/trip' },
    ]);
  });

  it('is just the root at the root', () => {
    assert.deepEqual(breadcrumb('/home/me', ['/home/me']), [{ name: 'me', path: '/home/me' }]);
  });

  it('handles a root that is the file system root', () => {
    assert.deepEqual(breadcrumb('/data/a', ['/']), [
      { name: '/', path: '/' },
      { name: 'data', path: '/data' },
      { name: 'a', path: '/data/a' },
    ]);
  });

  it('handles Windows paths', () => {
    assert.deepEqual(breadcrumb('D:\\Video\\Trip', ['D:\\Video']), [
      { name: 'Video', path: 'D:\\Video' },
      { name: 'Trip', path: 'D:\\Video\\Trip' },
    ]);
  });

  it('shows the whole path when no root matches', () => {
    assert.deepEqual(breadcrumb('/elsewhere', ['/home/me']), [
      { name: '/elsewhere', path: '/elsewhere' },
    ]);
    assert.deepEqual(breadcrumb('', ['/home/me']), []);
  });
});

describe('folderNameProblem', () => {
  it('accepts ordinary names', () => {
    assert.equal(folderNameProblem('Trip 2026'), '');
    assert.equal(folderNameProblem('  footage  '), '');
  });

  it('rejects empty, hidden and path-like names', () => {
    assert.ok(folderNameProblem('   '));
    assert.ok(folderNameProblem('.hidden'));
    assert.ok(folderNameProblem('a/b'));
    assert.ok(folderNameProblem('a\\b'));
    assert.ok(folderNameProblem('x'.repeat(256)));
  });
});
