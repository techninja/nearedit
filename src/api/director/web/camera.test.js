import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { getTheme } from '#utils/director/motion/themes.js';
import { zoomView } from '#utils/web/index.js';
import { serverMeasure } from '../motion/measure.js';
import { cameraKeys, cameraTrack, shownRect } from './camera.js';
import { captionClips } from './captions.js';
import { stageFor } from './stage.js';
import { DEMO_OWNERS as OWNERS, FORMATS, demoRecordings, scratchProject } from './testing/kit.js';

const theme = getTheme('midnight');
const colors = theme.backdrops[0];
let made;
before(async () => {
  made = await demoRecordings(scratchProject());
});

test('the camera zooms the page inside its window and never shows an edge', () => {
  for (const format of FORMATS) {
    for (const look of ['window', 'full']) {
      const { recording, recipe } = made[format.name];
      const { track } = recording;
      const stage = stageFor(look, format, recipe.viewport, true);
      const keys = cameraKeys(track, stage, { clicks: true, recipe });
      const [scales, xs, ys] = ['scaleX', 'x', 'y'].map((name) => keys[`transform.${name}`]);
      assert.deepEqual(keys['transform.scaleY'], scales);
      assert.equal(scales[0].v, stage.scale, 'it starts at rest');
      assert.equal(scales.at(-1).v, stage.scale, 'and comes back to it');
      assert.ok(
        Math.max(...scales.map((key) => key.v)) > stage.scale * 1.15,
        `${format.name} ${look}`,
      );
      const view = zoomView(track, stage.window);
      scales.forEach((key, i) => {
        if (i) assert.ok(key.t > scales[i - 1].t, 'in time order');
        // The page, as drawn, covers the window on every side.
        const zoom = key.v / stage.scale;
        const spare = {
          x: (view.vw * view.fit * zoom - view.W) / 2,
          y: (view.vh * view.fit * zoom - view.H) / 2,
        };
        assert.ok(
          Math.abs(xs[i].v - stage.offset.x) <= spare.x + 0.25,
          `${format.name} ${look}: x at ${key.t}`,
        );
        assert.ok(
          Math.abs(ys[i].v - stage.offset.y) <= spare.y + 0.25,
          `${format.name} ${look}: y at ${key.t}`,
        );
        assert.ok(zoom >= 1 - 1e-9 && zoom <= 2 + 1e-9);
      });
      // While the click is held, what was clicked shows inside the window.
      const click = track.steps[4];
      const seen = shownRect(click.rect, keys, track, stage, (click.actionEnd + click.end) / 2);
      assert.ok(seen && seen.width > click.rect.width * view.fit, 'larger than at rest');
      const win = stage.window;
      assert.ok(seen.x >= win.x && seen.x + seen.width <= win.x + win.width + 1e-6);
    }
  }
  const { recording, recipe } = made['16:9'];
  const stage = stageFor('window', FORMATS[0], recipe.viewport);
  const quiet = cameraKeys(recording.track, stage, { clicks: false, recipe });
  const moves = (keys) =>
    keys['transform.scaleX'].filter((key, i, all) => i && key.v > all[i - 1].v).length;
  assert.equal(moves(quiet), 1, 'without zoom on clicks, only "zoom in on" moves the camera');
  assert.ok(moves(cameraKeys(recording.track, stage, { clicks: true, recipe })) >= 2);
  const still = { ...recording.track, steps: recording.track.steps.slice(0, 2) };
  assert.deepEqual(
    cameraKeys(still, stage, { clicks: true, recipe }),
    {},
    'nothing to go close to',
  );
});

test('captions: under a window on the background, over a full page on a plate clear of the action', () => {
  const measure = serverMeasure();
  for (const format of FORMATS) {
    const { recording, recipe } = made[format.name];
    const { track } = recording;
    const base = { track, owners: OWNERS, fps: 30, startF: 60, theme, colors, measure };
    const windowed = stageFor('window', format, recipe.viewport, true);
    const keys = cameraKeys(track, windowed, { clicks: true, recipe });
    const under = captionClips({ ...base, keys, stage: windowed });
    assert.deepEqual(
      under.clips.map((clip) => clip.text.content),
      ['Start here', 'Readers, week by week', 'Two months free', 'And you are in'],
    );
    assert.equal(under.top, 0);
    for (const clip of under.clips) {
      const y = format.height / 2 + clip.transform.y;
      assert.ok(y > windowed.band.y && y < format.height, `${format.name}: in the band`);
      assert.equal(clip.text.background, '', 'no plate: the ground is the plate');
      assert.ok(clip.text.maxWidth <= windowed.band.width && clip.text.fontSize >= 24);
      assert.equal(clip.text.color, theme.ink);
    }
    // A stop's caption lasts from the first of its steps to the end of its last.
    const two = under.clips[2];
    assert.equal(two.timelineStart, 2 + track.steps[3].start);
    assert.equal(two.timelineEnd, 2 + track.steps[4].end);
    assert.ok(two.fadeIn > 0 && two.fadeIn + two.fadeOut < two.timelineEnd - two.timelineStart);
    const full = stageFor('full', format, recipe.viewport, true);
    const over = captionClips({
      ...base,
      keys: cameraKeys(track, full, { clicks: true, recipe }),
      stage: full,
    });
    assert.equal(over.clips.length, 4);
    for (const clip of over.clips) {
      assert.equal(clip.text.background, colors[0]);
      assert.ok(clip.text.boxRadius > 0 && Math.abs(clip.transform.y) < format.height / 2);
    }
    assert.equal(over.clips.filter((clip) => clip.transform.y < 0).length, over.top);
  }
  // The action low in a full frame sends its caption to the head of the picture.
  const { recording, recipe } = made['16:9'];
  const low = structuredClone(recording.track);
  low.steps[0].rect = { x: 500, y: 640, width: 200, height: 50 };
  const stage = stageFor('full', FORMATS[0], recipe.viewport, true);
  const placed = captionClips({
    track: low,
    owners: OWNERS,
    keys: {},
    fps: 30,
    startF: 0,
    theme,
    colors,
    measure,
    stage,
  });
  assert.ok(placed.clips[0].transform.y < 0 && placed.clips[1].transform.y > 0);
  assert.equal(placed.top, 1);
  // Something that fills the picture is under the plate wherever it goes: the foot it is.
  low.steps[0].rect = { x: 0, y: -0.16, width: 1280, height: 967.11 };
  const under = captionClips({
    ...{ track: low, owners: OWNERS, keys: {}, fps: 30, startF: 0 },
    ...{ theme, colors, measure, stage },
  });
  assert.deepEqual([under.top, under.clips[0].transform.y > 0], [0, true]);
});

test('the camera frames where the words appear, and "zoom in on" always goes as close as it can', () => {
  const { recording, recipe } = made['16:9'];
  const stage = stageFor('window', FORMATS[0], recipe.viewport);
  const seen = cameraTrack(recording.track, stage);
  const [typed, focused] = [seen.steps[5], seen.steps[2]];
  assert.deepEqual([recording.track.steps[5].rect.width, typed.rect.width], [498, 300]);
  assert.equal(typed.rect.x, recording.track.steps[5].rect.x, 'from where the text starts');
  // The chart is nearly as wide as the page: framed edge to edge, it still comes closer.
  assert.ok(focused.zoom > 1.05 && focused.zoom < 1.2, `${focused.zoom}`);
  const small = structuredClone(recording.track);
  small.steps[2].rect = { x: 500, y: 300, width: 200, height: 120 };
  assert.ok(cameraTrack(small, stage).steps[2].zoom > 1.5, 'something small is gone close to');
  small.steps[2].zoom = 3;
  assert.equal(cameraTrack(small, stage).steps[2].zoom, 3, 'a zoom the step sets itself is kept');
  small.steps[2].missing = true;
  assert.equal(cameraTrack(small, stage).steps[2], small.steps[2]);
});
