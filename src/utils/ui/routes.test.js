import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { editorUrl, isKnownPath, projectUrl } from './routes.js';

describe('routes', () => {
  it('builds project and editor URLs', () => {
    assert.equal(projectUrl('abc'), '/project/abc');
    assert.equal(editorUrl('abc', 'def'), '/editor/abc/def');
  });

  it('escapes ids so they stay one path segment', () => {
    assert.equal(projectUrl('a/b'), '/project/a%2Fb');
    assert.equal(isKnownPath(projectUrl('a/b')), true);
  });

  it('recognises the pages of the app', () => {
    for (const path of ['/', '/project/p1', '/editor/p1/a1']) {
      assert.equal(isKnownPath(path), true, path);
    }
  });

  it('treats everything else as not found', () => {
    for (const path of ['/nope', '/project', '/project/', '/editor/p1', '/editor/p1/a1/x', '/a/b']) {
      assert.equal(isKnownPath(path), false, path);
    }
  });
});
