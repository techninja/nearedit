import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterMedia, sortMedia, typeCounts } from './filter.js';
import { formatClock, formatResolution, formatSeconds, formatSize, metaParts } from './format.js';
import { clickSelection, pruneSelection, stepSelection } from './listSelection.js';
import { rowWindow, scrollToRow } from './virtualRows.js';

const item = (filename, type, extra = {}) => ({
  filename,
  filePath: `/p/${filename}`,
  relativePath: filename,
  type,
  tags: [],
  analysis: {},
  ...extra,
});
const items = [
  item('clip10.mp4', 'video', { duration: 4, size: 10, mtime: 3, tags: ['dog', 'park'] }),
  item('clip2.mp4', 'video', { duration: 90, size: 500, mtime: 1 }),
  item('song.mp3', 'audio', { duration: 200, size: 50, mtime: 2, tags: ['Upbeat'] }),
  item('logo.png', 'image', { size: 5, mtime: 9, relativePath: 'brand/logo.png' }),
  item('script.md', 'text', { size: 1, mtime: 0 }),
];
const names = (list) => list.map((i) => i.filename);

describe('filterMedia', () => {
  it('matches every search word against name, folder and tags, ignoring case', () => {
    assert.deepEqual(names(filterMedia(items, { query: 'CLIP' })), ['clip10.mp4', 'clip2.mp4']);
    assert.deepEqual(names(filterMedia(items, { query: 'park clip' })), ['clip10.mp4']);
    assert.deepEqual(names(filterMedia(items, { query: 'upbeat' })), ['song.mp3']);
    assert.deepEqual(names(filterMedia(items, { query: 'brand' })), ['logo.png']);
    assert.deepEqual(filterMedia(items, { query: 'dog song' }), []);
  });

  it('filters by type and combines with the search', () => {
    assert.deepEqual(names(filterMedia(items, { type: 'audio' })), ['song.mp3']);
    assert.deepEqual(names(filterMedia(items, { type: 'video', query: '2' })), ['clip2.mp4']);
    assert.equal(filterMedia(items, { type: 'all', query: '  ' }).length, 5);
  });

  it('counts items per type', () => {
    assert.deepEqual(typeCounts(items), { all: 5, video: 2, audio: 1, image: 1, text: 1 });
    assert.deepEqual(typeCounts([]), { all: 0, video: 0, audio: 0, image: 0, text: 0 });
  });
});

describe('sortMedia', () => {
  it('sorts names naturally and never mutates the input', () => {
    const before = names(items);
    const sorted = names(sortMedia(items, 'name'));
    assert.deepEqual(sorted, ['logo.png', 'clip2.mp4', 'clip10.mp4', 'script.md', 'song.mp3']);
    assert.deepEqual(names(items), before);
  });

  it('sorts by duration, size, date and type with name as the tie-break', () => {
    assert.equal(names(sortMedia(items, 'duration'))[0], 'song.mp3');
    assert.equal(names(sortMedia(items, 'size'))[0], 'clip2.mp4');
    assert.equal(names(sortMedia(items, 'date'))[0], 'logo.png');
    assert.deepEqual(names(sortMedia(items, 'type')), [
      'clip2.mp4',
      'clip10.mp4',
      'song.mp3',
      'logo.png',
      'script.md',
    ]);
    assert.deepEqual(names(sortMedia(items, /** @type {any} */ ('bogus'))).length, 5);
  });
});

describe('format', () => {
  it('formats clocks, short ranges and sizes', () => {
    assert.equal(formatClock(7.4), '0:07');
    assert.equal(formatClock(725), '12:05');
    assert.equal(formatClock(3723), '1:02:03');
    assert.equal(formatClock(null), '');
    assert.equal(formatSeconds(4.449), '4.4 s');
    assert.equal(formatSeconds(62.5), '1:02.5');
    assert.equal(formatSize(812), '812 B');
    assert.equal(formatSize(41705), '41 KB');
    assert.equal(formatSize(7301314), '7.0 MB');
    assert.equal(formatSize(undefined), '');
  });

  it('describes a file in a few facts', () => {
    const video = { type: 'video', duration: 12, width: 1920, height: 1080, fps: 29.97 };
    assert.deepEqual(metaParts(/** @type {any} */ (video)), [
      '0:12',
      '1920×1080',
      '29.97 fps',
      'no sound',
    ]);
    assert.equal(formatResolution({ width: 1920, height: 1080, rotation: 90 }), '1080×1920');
    assert.equal(formatResolution({ width: null, height: null }), '');
    assert.deepEqual(metaParts(/** @type {any} */ ({ type: 'text', duration: null })), ['text']);
  });
});

describe('list selection', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  const none = { selected: [], anchor: '' };

  it('plain click replaces, ctrl-click toggles and keeps pick order', () => {
    let sel = clickSelection(order, none, 'c');
    assert.deepEqual(sel, { selected: ['c'], anchor: 'c' });
    sel = clickSelection(order, sel, 'a', { toggle: true });
    sel = clickSelection(order, sel, 'e', { toggle: true });
    assert.deepEqual(sel.selected, ['c', 'a', 'e']);
    sel = clickSelection(order, sel, 'a', { toggle: true });
    assert.deepEqual(sel.selected, ['c', 'e']);
  });

  it('shift-click selects the range from the anchor, in click direction', () => {
    const anchored = { selected: ['d'], anchor: 'd' };
    assert.deepEqual(clickSelection(order, anchored, 'b', { range: true }).selected, [
      'd',
      'c',
      'b',
    ]);
    assert.deepEqual(clickSelection(order, anchored, 'e', { range: true }).selected, ['d', 'e']);
    assert.deepEqual(clickSelection(order, none, 'b', { range: true }).selected, ['b']);
  });

  it('steps with the arrow keys and prunes what is no longer listed', () => {
    const at = { selected: ['b'], anchor: 'b' };
    assert.deepEqual(stepSelection(order, at, 1).selected, ['c']);
    assert.deepEqual(stepSelection(order, at, 1, true).selected, ['b', 'c']);
    assert.deepEqual(stepSelection(order, { selected: ['a'], anchor: 'a' }, -1).selected, ['a']);
    assert.deepEqual(stepSelection(order, none, 1).selected, ['a']);
    const kept = pruneSelection(['a', 'c'], { selected: ['a', 'b', 'c'], anchor: 'b' });
    assert.deepEqual(kept, { selected: ['a', 'c'], anchor: '' });
    assert.equal(pruneSelection(order, at), at);
  });
});

describe('rowWindow', () => {
  it('renders only the rows near the viewport', () => {
    const win = rowWindow({ count: 1000, rowHeight: 40, scrollTop: 4000, viewportHeight: 400 });
    assert.deepEqual(win, { first: 94, last: 116, offset: 3760, height: 40000 });
    assert.ok(win.last - win.first < 30);
  });

  it('copes with short lists, over-scroll and an unmeasured viewport', () => {
    const view = { count: 3, rowHeight: 40, scrollTop: 0, viewportHeight: 400 };
    assert.deepEqual(rowWindow(view), { first: 0, last: 3, offset: 0, height: 120 });
    const over = rowWindow({ count: 100, rowHeight: 40, scrollTop: 99999, viewportHeight: 400 });
    assert.equal(over.last, 100);
    assert.ok(over.first >= 80);
    assert.equal(rowWindow({ count: 0, rowHeight: 40, scrollTop: 0, viewportHeight: 0 }).last, 0);
    assert.ok(rowWindow({ count: 50, rowHeight: 40, scrollTop: 0, viewportHeight: 0 }).last >= 1);
  });

  it('scrolls a row into view with the least movement', () => {
    const view = { rowHeight: 40, scrollTop: 400, viewportHeight: 200 };
    assert.equal(scrollToRow(12, view), 400);
    assert.equal(scrollToRow(2, view), 80);
    assert.equal(scrollToRow(20, view), 640);
  });
});
