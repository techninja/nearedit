import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, GENERATORS } from '#utils/compose/index.js';
import { getTheme, THEMES } from '#utils/director/motion/themes.js';
import { describePath } from '#utils/edl/index.js';
import { applyDirectorResult } from '#utils/edl/apply.js';
import { createEdl } from '#utils/edl/factory.js';
import { validateEdl } from '#utils/edl/validate.js';
import { isStale, isWebClip, zoomView } from '#utils/web/index.js';
import { serverMeasure } from '../motion/measure.js';
import { checkResult } from '../testing/invariants.js';
import { ROWS, buildDemo } from './build.js';
import { cameraKeys, shownRect } from './camera.js';
import { captionClips } from './captions.js';
import { titleCard } from './card.js';
import { INSET, stageFor, windowEffects } from './stage.js';
import { FORMATS, recordingOf, scratchProject } from './testing/kit.js';

const DIR = scratchProject();
const VIEWS = { '16:9': [1280, 720], '9:16': [390, 844], '1:1': [960, 960] };
const STEPS = [
  { do: 'hover', target: 'text=Get started', note: 'Start here' },
  { do: 'scroll', to: '#features', align: 'start' },
  { do: 'focus', target: 'svg[aria-label="Readers chart"]', note: 'Readers, week by week' },
  {
    do: 'scroll',
    to: 'text=Yearly',
    align: 'center',
    duration: 0.7,
    hold: 0.1,
    note: 'Two months free',
  },
  { do: 'click', target: 'text=Yearly', note: 'Two months free' },
  { do: 'type', target: 'label=Email', text: 'hello@example.com' },
  { do: 'click', target: 'text=Create account', note: 'And you are in' },
];
const OWNERS = [0, 1, 2, 3, 3, 4, 5];
const LABELS = ['Start here', 'scroll “Features”', 'Readers', 'Two months free', 'type', 'In'];
const theme = getTheme('midnight');
const colors = theme.backdrops[0];
let made;
before(async () => {
  made = {};
  for (const format of FORMATS) {
    const [width, height] = VIEWS[format.name];
    made[format.name] = await recordingOf(DIR, { viewport: { width, height }, steps: STEPS });
  }
});
const noCard = { titles: [], text: [], frames: 0, notes: [] };
const build = (format, look, more = {}) => {
  const { recording, recipe } = made[format.name];
  const captioned = more.captions !== false;
  const stage = stageFor(look, format, recipe.viewport, captioned);
  const parts = { recording, recipe, stage, theme, colors, format, card: noCard, labels: LABELS };
  return {
    stage,
    built: buildDemo({ ...parts, owners: OWNERS, zoom: true, captions: true, ...more }),
  };
};
const row = (built, name) => built.tracks.find((track) => track.name === name).clips;

test('the stage: a page that fills the frame, or a window that keeps the page’s shape', () => {
  for (const format of FORMATS) {
    const [width, height] = VIEWS[format.name];
    const full = stageFor('full', format, { width, height });
    assert.deepEqual(full.window, { x: 0, y: 0, width: format.width, height: format.height });
    assert.deepEqual([full.scale, full.offset, full.band], [1, { x: 0, y: 0 }, null]);
    for (const captioned of [false, true]) {
      const stage = stageFor('window', format, { width, height }, captioned);
      const { window: win, band } = stage;
      const short = Math.min(format.width, format.height);
      assert.ok(Math.abs(win.width / win.height - width / height) < 0.01, 'the page’s own shape');
      assert.ok(
        win.x >= INSET * short - 1 && win.x + win.width <= format.width - INSET * short + 1,
      );
      assert.ok(win.y > 0 && win.y + win.height < format.height);
      assert.equal(win.x + win.width / 2, format.width / 2, 'centred sideways');
      assert.equal(stage.offset.y, win.y + win.height / 2 - format.height / 2);
      const cover = Math.max(format.width / width, format.height / height);
      assert.ok(
        Math.abs(width * cover * stage.scale - win.width) < 0.1,
        'the clip’s scale draws it that wide',
      );
      if (!captioned) {
        assert.equal(band, null);
        assert.equal(stage.offset.y, 0, 'no captions: in the middle');
        continue;
      }
      assert.ok(stage.offset.y < 0, 'raised to make room');
      assert.equal(band.y, win.y + win.height);
      assert.equal(band.y + band.height, format.height);
      assert.ok(band.height >= 0.13 * short, 'room for two lines');
    }
  }
});

test('a window is a rounded mask and then a shadow; a full page has neither', () => {
  const stage = stageFor('window', FORMATS[0], { width: 1280, height: 720 }, true);
  const [mask, shadow] = windowEffects(stage, '#010203');
  assert.deepEqual([mask.type, shadow.type], ['mask', 'dropShadow'], 'cut first, then light');
  assert.equal(mask.params.shape, 'rectangle');
  assert.ok(Math.abs(mask.params.width * 1920 - stage.window.width) < 1e-9);
  assert.ok(
    Math.abs(mask.params.center.y * 1080 - (stage.window.y + stage.window.height / 2)) < 1e-9,
  );
  assert.ok(
    mask.params.radius > 10 && shadow.params.blur > 10 && shadow.params.color === '#010203',
  );
  for (const effect of [mask, shadow]) {
    const known = EFFECTS.find((entry) => entry.type === effect.type);
    for (const name of Object.keys(effect.params))
      assert.ok(known.params[name], `${effect.type}.${name}`);
  }
  assert.deepEqual(
    windowEffects(stageFor('full', FORMATS[0], { width: 1280, height: 720 }), '#000000'),
    [],
  );
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
          Math.abs(xs[i].v - stage.offset.x) <= spare.x + 0.02,
          `${format.name} ${look}: x at ${key.t}`,
        );
        assert.ok(
          Math.abs(ys[i].v - stage.offset.y) <= spare.y + 0.02,
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
  assert.ok(moves(cameraKeys(recording.track, stage, { clicks: true, recipe })) >= 3);
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
});

test('the fragment: four rows, one web clip that can be recorded again, a marker per stop', () => {
  for (const format of FORMATS) {
    for (const look of ['window', 'full']) {
      const { built, stage } = build(format, look);
      const { recording, recipe } = made[format.name];
      assert.deepEqual(
        built.tracks.map((track) => track.name),
        ROWS,
      );
      const [page] = row(built, 'Page');
      assert.equal(row(built, 'Page').length, 1);
      assert.ok(isWebClip(page) && !isStale(page, format.fps), 'recorded, and not stale');
      assert.deepEqual(page.web, { recipe, key: recording.key, title: recording.title });
      assert.deepEqual(
        [page.sourceFile, page.sourceIn, page.sourceOut],
        [recording.file, 0, recording.duration],
      );
      assert.equal(page.transform.scaleX, stage.scale);
      assert.equal(page.effects.length, look === 'window' ? 2 : 0);
      for (const path of Object.keys(page.keyframes)) assert.ok(describePath(page, path), path);
      assert.equal(row(built, 'Background').length, look === 'window' ? 1 : 0);
      assert.equal(row(built, 'Titles').length, 4);
      assert.deepEqual(
        built.markers.map((marker) => marker.label),
        LABELS,
      );
      assert.equal(
        built.markers[3].time,
        recording.track.steps[3].start,
        'where the stop’s first step begins',
      );
      assert.equal(built.seconds, recording.duration);
      assert.deepEqual(built.counts, {
        zooms: built.counts.zooms,
        captions: 4,
        top: built.counts.top,
      });
      assert.ok(built.counts.zooms >= 2);
      const result = {
        mode: 'replace',
        at: 0,
        range: null,
        ...built,
        duration: built.seconds,
        summary: 'A demo',
        notes: [],
        plan: {},
      };
      assert.deepEqual(checkResult(result, { fps: format.fps, roots: [DIR] }), []);
      const empty = createEdl({ fps: format.fps, resolution: `${format.width}x${format.height}` });
      assert.deepEqual(
        validateEdl(applyDirectorResult(empty, result)).problems,
        [],
        `${format.name} ${look}`,
      );
    }
  }
  const quiet = build(FORMATS[0], 'window', { captions: false }).built;
  assert.equal(row(quiet, 'Titles').length, 0);
});

test('the ground is a generator of the theme; a title card comes first and the page after it', () => {
  for (const one of THEMES) {
    const { recording, recipe } = made['16:9'];
    const stage = stageFor('window', FORMATS[0], recipe.viewport, true);
    const card = titleCard('Tideline in twenty seconds', 'changelogs people read', {
      theme: one.id,
      format: FORMATS[0],
      pacing: 'medium',
      seed: 1,
    });
    const parts = {
      recording,
      recipe,
      stage,
      theme: one,
      colors: one.backdrops[0],
      format: FORMATS[0],
      card,
    };
    const built = buildDemo({
      ...parts,
      labels: LABELS,
      owners: OWNERS,
      zoom: true,
      captions: true,
    });
    const [ground] = row(built, 'Background');
    const known = GENERATORS.find((entry) => entry.type === ground.generator.type);
    assert.ok(known, `${one.id}: ${ground.generator.type}`);
    for (const name of Object.keys(ground.generator.params))
      assert.ok(known.params[name], `${one.id}.${name}`);
    assert.deepEqual(
      [ground.timelineStart, ground.timelineEnd],
      [0, built.seconds],
      'under the whole piece',
    );
    const [page] = row(built, 'Page');
    assert.ok(card.frames >= 60 && page.timelineStart === card.frames / 30);
    assert.ok(page.fadeIn > 0);
    const [title] = row(built, 'Titles');
    assert.equal(title.text.content, 'Tideline in twenty seconds');
    assert.ok(
      title.timelineEnd <= page.timelineStart + 1e-9,
      'the words are gone when the page arrives',
    );
    assert.equal(row(built, 'Text')[0].text.content, 'changelogs people read');
    assert.equal(built.markers[0].time, page.timelineStart + recording.track.steps[0].start);
    const result = {
      mode: 'replace',
      at: 0,
      range: null,
      ...built,
      duration: built.seconds,
      summary: 'A demo',
      notes: [],
      plan: {},
    };
    assert.deepEqual(checkResult(result, { fps: 30, roots: [DIR] }), [], one.id);
  }
  // Full frame: the ground only carries the card, and ends once the page has faded in over it.
  const { recording, recipe } = made['16:9'];
  const stage = stageFor('full', FORMATS[0], recipe.viewport, true);
  const card = titleCard('Hello', '', {
    theme: 'paper',
    format: FORMATS[0],
    pacing: 'fast',
    seed: 1,
  });
  const parts = {
    recording,
    recipe,
    stage,
    theme,
    colors,
    format: FORMATS[0],
    card,
    labels: LABELS,
  };
  const built = buildDemo({ ...parts, owners: OWNERS, zoom: false, captions: false });
  const [ground] = row(built, 'Background');
  const [page] = row(built, 'Page');
  assert.equal(ground.timelineEnd, page.timelineStart + page.fadeIn);
  assert.deepEqual(row(built, 'Text'), []);
  assert.deepEqual(
    titleCard('  ', 'x', { theme: 'paper', format: FORMATS[0], pacing: 'fast', seed: 1 }),
    noCard,
  );
});
