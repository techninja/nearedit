import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_STEP, LIMITS, SPLITTER, clampSize, draggedSize, isNarrow } from './layout.js';
import { dockTabOf, keyDelta, layoutVars, paneRange, sheetAfterTap } from './layout.js';

describe('paneRange', () => {
  it('leaves room for the neighbouring panes', () => {
    assert.deepEqual(paneRange('dock', 1280), { min: 240, max: 1280 - 320 - SPLITTER });
    assert.deepEqual(paneRange('timeline', 800), { min: 144, max: 800 - 200 - SPLITTER });
    assert.deepEqual(paneRange('sheet', 700), { min: 128, max: 700 - 208 - SPLITTER });
  });

  it('never yields a maximum below the minimum in a tiny window', () => {
    const range = paneRange('dock', 300);
    assert.equal(range.max, range.min);
    assert.equal(range.min, LIMITS.dock.min);
  });
});

describe('clampSize', () => {
  const range = { min: 240, max: 900 };

  it('keeps a size inside its range, in whole pixels', () => {
    assert.equal(clampSize(100, range), 240);
    assert.equal(clampSize(1200, range), 900);
    assert.equal(clampSize(412.6, range), 413);
  });

  it('falls back to the minimum for a non-number', () => {
    assert.equal(clampSize(NaN, range), 240);
    assert.equal(clampSize(Infinity, range), 240);
  });
});

describe('draggedSize', () => {
  const range = { min: 144, max: 600 };

  it('grows the dock when the pointer moves right', () => {
    assert.equal(draggedSize(300, 40, { grows: 1 }, { min: 240, max: 900 }), 340);
    assert.equal(draggedSize(300, -40, { grows: 1 }, { min: 240, max: 900 }), 260);
  });

  it('grows the timeline when the pointer moves up', () => {
    assert.equal(draggedSize(300, -50, { grows: -1 }, range), 350);
    assert.equal(draggedSize(300, 50, { grows: -1 }, range), 250);
  });

  it('stops at the limits however far the pointer travels', () => {
    assert.equal(draggedSize(300, 5000, { grows: -1 }, range), 144, 'never collapses');
    assert.equal(draggedSize(300, -5000, { grows: -1 }, range), 600, 'never swallows the rest');
  });
});

describe('keyDelta', () => {
  it('moves the dock splitter with left and right', () => {
    assert.equal(keyDelta('ArrowRight', 'dock'), KEY_STEP);
    assert.equal(keyDelta('ArrowLeft', 'dock'), -KEY_STEP);
    assert.equal(keyDelta('ArrowUp', 'dock'), 0);
  });

  it('makes the timeline and sheet taller with up', () => {
    assert.equal(keyDelta('ArrowUp', 'timeline'), KEY_STEP);
    assert.equal(keyDelta('ArrowDown', 'sheet'), -KEY_STEP);
    assert.equal(keyDelta('ArrowLeft', 'timeline'), 0);
    assert.equal(keyDelta('a', 'timeline'), 0);
  });
});

describe('layoutVars', () => {
  it('writes stored sizes as px and leaves defaults to the stylesheet', () => {
    assert.deepEqual(layoutVars({ dockWidth: 412.4, timelineHeight: 0, sheetHeight: 300 }), {
      '--editor-dock': '412px',
      '--editor-timeline': '',
      '--editor-sheet': '300px',
    });
    assert.deepEqual(layoutVars({}), {
      '--editor-dock': '',
      '--editor-timeline': '',
      '--editor-sheet': '',
    });
  });
});

describe('isNarrow', () => {
  it('switches to the stacked layout below the breakpoint', () => {
    assert.equal(isNarrow(390), true);
    assert.equal(isNarrow(759), true);
    assert.equal(isNarrow(760), false);
    assert.equal(isNarrow(1440), false);
  });
});

describe('dock tabs', () => {
  it('falls back to the media tab for an unknown stored value', () => {
    assert.equal(dockTabOf('director'), 'director');
    assert.equal(dockTabOf(''), 'media');
    assert.equal(dockTabOf('settings'), 'media');
  });

  it('opens the sheet on a tapped tab', () => {
    assert.deepEqual(sheetAfterTap({ dockTab: 'media', sheetOpen: false }, 'media'), {
      dockTab: 'media',
      sheetOpen: true,
    });
    assert.deepEqual(sheetAfterTap({ dockTab: 'media', sheetOpen: true }, 'director'), {
      dockTab: 'director',
      sheetOpen: true,
    });
  });

  it('closes the sheet when the showing tab is tapped again', () => {
    assert.deepEqual(sheetAfterTap({ dockTab: 'director', sheetOpen: true }, 'director'), {
      dockTab: 'director',
      sheetOpen: false,
    });
  });
});
