import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecipe, validateRecipe } from '#utils/web/index.js';
import { mapLayout, markOf, percentBox, placeOf, pointTarget, stackedElements } from './pageMap.js';
import { sectionGroups } from './pageSections.js';
import {
  elementActions,
  pickActions,
  pickTitle,
  pickedTarget,
  pointActions,
} from './pickActions.js';
import * as strip from './scoreStrip.js';
import { testSnapshot } from './testkit.js';

const snap = testSnapshot();
const scrolled = testSnapshot({ scrollY: 500 });

describe('page map', () => {
  it('lays the picture out where the viewport is on the whole page', () => {
    assert.deepEqual(mapLayout(snap), {
      width: 1280,
      height: 2000,
      view: { x: 0, y: 0, width: 1280, height: 720 },
    });
    assert.equal(mapLayout(scrolled).view.y, 500);
    // A page shorter than its viewport is as tall as the viewport.
    assert.equal(mapLayout(testSnapshot({ page: { width: 1280, height: 300 } })).height, 720);
    assert.deepEqual(percentBox({ x: 128, y: 500, width: 640, height: 100 }, mapLayout(snap)), {
      left: '10%',
      top: '25%',
      width: '50%',
      height: '5%',
    });
  });

  it('stacks small elements over the sections that hold them', () => {
    const order = stackedElements(snap).map((element) => element.name);
    assert.deepEqual(order, ['Hero', 'Sign up', 'Email', 'Get started', 'Pricing']);
    assert.equal(stackedElements(snap)[3].index, 1);
  });

  it('turns a point of the picture into a viewport target, and nothing outside it', () => {
    assert.equal(pointTarget(snap, { x: 640.4, y: 300.2 }), 'point=640,300');
    assert.equal(pointTarget(scrolled, { x: 10, y: 520 }), 'point=10,20');
    assert.equal(pointTarget(snap, { x: 10, y: 900 }), '');
    assert.equal(pointTarget(scrolled, { x: 10, y: 100 }), '');
  });

  it('finds what a target marks', () => {
    assert.deepEqual(markOf(snap, 'text=Get started'), { index: 1, point: null });
    assert.deepEqual(markOf(snap, 'css=a[href="#pricing"]'), { index: 2, point: null });
    assert.deepEqual(markOf(scrolled, { x: 100, y: 50 }), { index: -1, point: { x: 100, y: 550 } });
    assert.deepEqual(markOf(snap, ''), { index: -1, point: null });
    assert.deepEqual(markOf(snap, 300), { index: -1, point: null });
    assert.equal(markOf(snap, 'text=Nowhere').index, -1);
  });

  it('says where things lie against the picture and groups them by section', () => {
    assert.equal(placeOf(snap, snap.elements[4].rect), 'below');
    assert.equal(placeOf(scrolled, snap.elements[2].rect), 'above');
    assert.equal(placeOf(snap, snap.elements[1].rect), 'view');
    const groups = sectionGroups(snap).map((g) => [g.name, g.elements.map((e) => e.name)]);
    assert.deepEqual(groups, [
      ['Hero', ['Get started', 'Pricing']],
      ['Sign up', ['Email']],
    ]);
    const loose = testSnapshot({ elements: [snap.elements[1]] });
    assert.deepEqual(sectionGroups(loose)[0].name, 'Page');
  });
});

describe('pick actions', () => {
  const valid = (step) =>
    validateRecipe({ url: 'https://example.com', steps: [{ text: 'x', ...step }] }).valid;

  it('offers six steps for an element, each one the recipe accepts', () => {
    const actions = elementActions('text=Get started');
    assert.deepEqual(
      actions.map((action) => action.label),
      ['Click', 'Hover', 'Type into', 'Scroll to', 'Highlight', 'Zoom in'],
    );
    assert.deepEqual(actions[3].step, { do: 'scroll', to: 'text=Get started' });
    assert.deepEqual(actions[5].step, { do: 'focus', target: 'text=Get started' });
    for (const action of actions) assert.ok(valid(action.step), action.id);
  });

  it('offers a point of the picture as a target, and a scroll for anywhere', () => {
    const inside = pointActions(snap, { x: 640, y: 300 });
    assert.deepEqual(
      inside.map((action) => action.id),
      ['click', 'hover', 'type', 'focus', 'scroll'],
    );
    assert.equal(inside[0].step.target, 'point=640,300');
    for (const action of inside) assert.ok(valid(action.step), action.id);
    // Below the picture: scroll so that height is in the middle of the viewport.
    assert.deepEqual(pointActions(snap, { x: 200, y: 1500 }), [
      { id: 'scroll', label: 'Scroll to here', step: { do: 'scroll', to: 1140 } },
    ]);
    assert.equal(pointActions(snap, { x: 200, y: 1990 })[0].step.to, 1280);
    assert.equal(normalizeRecipe({ url: 'https://e.com', steps: [inside[4].step] }).steps[0].to, 0);
  });

  it('names a pick and gives its target', () => {
    const element = { element: snap.elements[1], point: { x: 150, y: 310 } };
    const point = { element: null, point: { x: 640, y: 300 } };
    const far = { element: null, point: { x: 640, y: 1500 } };
    assert.equal(pickTitle(element, snap), 'button · Get started');
    assert.equal(pickTitle(point, snap), 'Point 640, 300');
    assert.equal(pickTitle(far, snap), 'Page, 1500 px down');
    assert.equal(pickedTarget(element, snap), 'text=Get started');
    assert.equal(pickedTarget(point, snap), 'point=640,300');
    assert.equal(pickedTarget(far, snap), '');
    assert.equal(pickActions(element, snap).length, 6);
    assert.equal(pickActions(far, snap).length, 1);
  });
});

describe('score strip', () => {
  const recipe = normalizeRecipe({
    url: 'https://example.com',
    steps: [
      { do: 'click', target: '#a' },
      { do: 'goto', url: '/next' },
    ],
  });

  it('lays the recording out as lead, actions, holds and tail in whole frames', () => {
    const { blocks, duration, frames, fps } = strip.stripBlocks(recipe, 30);
    assert.deepEqual(
      blocks.map((block) => [block.part, block.index, block.frames]),
      [
        ['lead', -1, 18],
        ['duration', 0, 21],
        ['hold', 0, 18],
        ['duration', 1, 0],
        ['hold', 1, 30],
        ['tail', -1, 30],
      ],
    );
    assert.equal(frames, 117);
    assert.equal(duration, 3.9);
    assert.equal(fps, 30);
    assert.equal(blocks[1].label, '1. Click: #a');
    assert.equal(blocks.at(-1).end, duration);
    const empty = strip.stripBlocks(normalizeRecipe({ url: 'https://example.com' }), 25);
    assert.deepEqual(
      empty.blocks.map((block) => [block.part, block.frames]),
      [
        ['lead', 15],
        ['tail', 25],
      ],
    );
  });

  it('retimes a block to whole frames inside the limits', () => {
    const longer = strip.retime(recipe, { part: 'duration', index: 0 }, 45, 30);
    assert.equal(longer.steps[0].duration, 1.5);
    assert.equal(strip.retime(recipe, { part: 'hold', index: 1 }, 0, 30).steps[1].hold, 0);
    assert.equal(strip.retime(recipe, { part: 'lead', index: -1 }, 60, 30).lead, 2);
    assert.equal(strip.retime(recipe, { part: 'tail', index: -1 }, -5, 30).tail, 0);
    assert.equal(strip.retime(recipe, { part: 'tail', index: -1 }, 1e9, 30).tail, 120);
    assert.equal(strip.stripBlocks(normalizeRecipe(longer), 30).blocks[1].frames, 45);
  });

  it('turns a drag and a key press into frames', () => {
    assert.equal(strip.draggedFrames(21, 50, 100, 30), 36);
    assert.equal(strip.draggedFrames(21, -500, 100, 30), 0);
    assert.equal(strip.draggedFrames(21, 50, 0, 30), 21);
    assert.equal(strip.keyFrames(10, { key: 'ArrowRight' }), 11);
    assert.equal(strip.keyFrames(10, { key: 'ArrowLeft', shiftKey: true }), 0);
    assert.equal(strip.keyFrames(10, { key: 'Enter' }), null);
  });

  it('maps a point of the strip to a frame of the recording and its step', () => {
    const { blocks } = strip.stripBlocks(recipe, 30);
    assert.equal(strip.timeAtX(100, 390, 3.9, 30), 1);
    assert.equal(strip.timeAtX(9999, 390, 3.9, 30), 3.9 - 1 / 30);
    assert.equal(strip.timeAtX(10, 0, 3.9, 30), 0);
    assert.equal(strip.stepAtTime(blocks, 0.2), -1);
    assert.equal(strip.stepAtTime(blocks, 1), 0);
    assert.equal(strip.stepAtTime(blocks, 2.5), 1);
    assert.equal(strip.stepAtTime(blocks, 3.5), -1);
  });
});
