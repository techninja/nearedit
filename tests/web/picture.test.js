import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { glide, scrollAt, typedLength } from '#utils/web/index.js';
import { inspect } from '../../src/api/render/testkit.js';
import { run } from '../../src/api/lib/ffmpeg.js';
import * as kit from './kit.js';
import { startSite } from './site.js';

/**
 * What a recording shows, frame by frame: the page's clock moves one frame
 * per frame, and the pointer, the clicks, the keys and the scrolling land
 * on the frames the score gives. Everything is read back from the pixels.
 */

const { near, span } = kit;
const ORANGE = '#ff8000';
const isOrange = (rgb) => rgb[0] > 200 && rgb[1] > 90 && rgb[1] < 170 && rgb[2] < 70;
const isRed = (rgb) => rgb[0] > 200 && rgb[1] < 60 && rgb[2] < 60;
const isBlue = (rgb) => rgb[0] < 60 && rgb[1] < 60 && rgb[2] > 200;
const middle = (box) => [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];

describe('web recorder: the picture', { skip: kit.SKIP }, () => {
  let site;
  let rec;
  before(async () => {
    site = await startSite();
    rec = (recipe, options = {}) => kit.record(recipe, { allow: site.allow, ...options });
  });
  after(async () => {
    await site.close();
    assert.deepEqual(kit.leftovers(), { processes: [], profiles: [] });
    kit.cleanup();
  });

  it('records the score: its frames, its length, a file the editor can scrub', async () => {
    const { file, track, score, frames } = await rec({
      url: `${site.url}/`,
      steps: [{ do: 'wait' }],
    });
    assert.equal(score.frames, 42, 'lead 0.2 + wait 1 + tail 0.2 at 30 fps');
    assert.equal(frames.count, score.frames);
    const { video, audio, duration } = await inspect(file);
    assert.equal(audio, undefined, 'no sound');
    assert.equal(Number(video.nb_read_frames), score.frames);
    assert.ok(Math.abs(duration - score.duration) < 0.001, `${duration} s`);
    assert.deepEqual(
      [video.codec_name, video.pix_fmt, video.width, video.height, video.r_frame_rate],
      ['h264', 'yuv420p', 640, 360, '30/1'],
    );
    assert.deepEqual([video.color_space, video.color_range], ['bt709', 'tv']);
    const types = await run('ffprobe', [
      ...['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=pict_type'],
      ...['-of', 'csv=p=0', file],
    ]);
    const keys = types.stdout.split('\n').flatMap((type, n) => (type.startsWith('I') ? [n] : []));
    assert.deepEqual(keys, [0, 15, 30], 'a key frame every half second');
    assert.deepEqual(
      [track.version, track.fps, track.duration, track.width, track.height, track.scale],
      [1, 30, score.duration, 640, 360, 1],
    );
    assert.equal(track.title, 'NearEdit test site');
    assert.deepEqual(track.viewport, { width: 640, height: 360 });
    assert.deepEqual(track.scroll, [[0, 0]]);
    assert.deepEqual([track.cursor, track.warnings], [[], []], 'no pointer until a step needs one');
  });

  it('moves the page one frame per frame: animation, hover, pointer, click', async () => {
    const steps = [
      { do: 'move', target: { x: 400, y: 300 }, duration: 1, hold: 0.2 },
      { do: 'hover', target: '#hover', duration: 0, hold: 0.8 },
      { do: 'click', target: 'text=Switch the lamp', duration: 0.3, hold: 0.4 },
      { do: 'highlight', target: '#lamp', color: '#00ffff', duration: 0.2, hold: 0.6 },
      { do: 'hide', target: '#banner' },
      { do: 'highlight', target: '#lamp', style: 'spotlight', duration: 0.2, hold: 0.6 },
    ];
    const cursor = { style: 'dot', color: ORANGE };
    const { frames, score, track } = await rec({ url: `${site.url}/`, cursor, steps });
    assert.equal(frames.count, score.frames);

    // The slider crosses 600 px in 2 s: 10 px a frame, whatever the capture takes.
    for (let n = 0; n < span(score, 5).S; n++) {
      const box = frames.box(n, (rgb) => isRed(rgb));
      const off = Math.abs(box[0] - ((300 + 10 * n) % 600));
      assert.ok(Math.min(off, 600 - off) <= 1, `frame ${n}: slider at ${box[0]}`);
    }

    // The pointer is where the shared motion maths puts it, from below the picture to its target.
    const move = span(score, 0);
    const from = { x: 640 * 0.62, y: 360 + 24 };
    for (let n = move.S + 18; n <= move.A; n += 4) {
      const want = glide(from, { x: 400, y: 300 }, (n - move.S) / (move.A - move.S), 'ease-in-out');
      const [x, y] = middle(frames.box(n, isOrange));
      assert.ok(
        Math.hypot(x - want.x, y - want.y) < 1.5,
        `frame ${n}: ${x},${y} for ${want.x},${want.y}`,
      );
      const noted = track.cursor.find(([t]) => Math.abs(t * 30 - n) < 0.01);
      assert.ok(
        Math.hypot(noted[1] - want.x, noted[2] - want.y) < 0.1,
        'and the track says the same',
      );
    }
    assert.deepEqual(track.steps[0].point, { x: 400, y: 300 });

    // A 0.5 s linear transition takes exactly 15 frames from the frame the pointer arrives.
    const hover = span(score, 1);
    assert.ok(near(frames.at(hover.S - 1, 60, 70), [0, 200, 0], 6));
    for (let k = 0; k <= 15; k++) {
      const want = [0, 200 * (1 - k / 15), (200 * k) / 15];
      assert.ok(
        near(frames.at(hover.S + k, 60, 70), want, 8),
        `hover frame ${k}: ${frames.at(hover.S + k, 60, 70)}`,
      );
    }
    assert.deepEqual(track.steps[1].rect, { x: 40, y: 60, width: 160, height: 40 });
    assert.deepEqual(track.steps[1].point, { x: 120, y: 80 });

    // The button is pressed when the glide ends and let go 0.12 s — four frames — later.
    const click = span(score, 2);
    const lamp = (n) => frames.at(n, 260, 140);
    assert.ok(near(lamp(click.A + 3), [0, 0, 0]), 'still dark while the button is down');
    assert.ok(
      near(lamp(click.A + 4), [255, 255, 0]),
      `lit on the release frame: ${lamp(click.A + 4)}`,
    );
    assert.equal(track.steps[2].target, 'text=Switch the lamp');

    // The ring sits 6 px outside the element, fades in over the duration and is gone by the end.
    const ring = span(score, 3);
    const isCyan = (rgb) => rgb[0] < 90 && rgb[1] > 180 && rgb[2] > 180;
    assert.equal(frames.box(ring.S, isCyan), null, 'not yet');
    const box = frames.box(ring.A + 3, isCyan);
    assert.ok(
      [234, 114, 285, 165].every((edge, i) => Math.abs(box[i] - edge) <= 1),
      `the ring, 3 px wide, around 240,120 … 280,160: ${box}`,
    );
    assert.ok(near(frames.at(ring.A + 3, 260, 140), [255, 255, 0]), 'the lamp inside untouched');
    assert.equal(frames.box(ring.E, isCyan), null, 'gone when the step ends');
    assert.deepEqual(track.steps[3].rect, { x: 240, y: 120, width: 40, height: 40 });

    // `hide` takes the banner away between two frames.
    const hide = span(score, 4);
    assert.ok(near(frames.at(hide.S - 1, 320, 350), [255, 0, 255]));
    assert.ok(near(frames.at(hide.S, 320, 350), [255, 255, 255]), `${frames.at(hide.S, 320, 350)}`);

    // The spotlight dims everything but the element.
    const spot = span(score, 5);
    const dimmed = frames.at(spot.A + 2, 500, 250);
    assert.ok(near(dimmed, [106, 111, 123], 12), `the page around is dimmed: ${dimmed}`);
    assert.ok(near(frames.at(spot.A + 2, 260, 140), [255, 255, 0]), 'the lamp is not');
    assert.ok(
      near(frames.at(spot.E, 500, 250), [255, 255, 255]),
      'and it is over when the step ends',
    );
  });

  it('types one key at a time, chooses options, ticks boxes', async () => {
    const steps = [
      { do: 'type', target: 'label=Full name', text: 'Héllo 😀', speed: 10, clear: true },
      { do: 'select', target: 'label=Plan', value: 'Team of five', duration: 0.3, hold: 0.3 },
      { do: 'click', target: 'label=I agree', duration: 0.3, hold: 0.3 },
      { do: 'press', key: 'a', modifiers: ['Control'], hold: 0.1 },
      { do: 'press', key: 'Enter', hold: 0.1 },
      {
        do: 'run',
        js: "if (keys.slice(-2).join() !== 'Control+a,Enter') throw new Error(keys.join())",
      },
      {
        do: 'run',
        js: "if (document.getElementById('name').value !== 'Héllo 😀') throw new Error('typed')",
      },
    ];
    const { frames, score, recipe, track } = await rec({ url: `${site.url}/form.html`, steps });
    // One block of 10 px per character in the field: the bar's width is the count.
    const typed = (n) => {
      const box = frames.box(n, (rgb) => isRed(rgb));
      return box ? Math.round((box[2] - box[0] + 1) / 10) : 0;
    };
    const type = span(score, 0);
    const seconds = (type.A - type.S) / 30;
    assert.equal(seconds, 0.5 + 7 / 10, 'half a second to reach the field, then seven keys');
    let last = 0;
    for (let n = type.S + 17; n <= type.E; n++) {
      const want = typedLength(recipe.steps[0], (n - type.S) / 30, seconds);
      assert.equal(typed(n), want, `frame ${n}: ${typed(n)} characters shown`);
      assert.ok(want - last <= 1, 'never two at once');
      last = want;
    }
    assert.equal(last, 7, 'the emoji is one character');
    assert.equal(typed(type.S + 15), 0, 'the old text is still there until the field is cleared');
    assert.deepEqual(track.steps[0].rect, { x: 40, y: 74, width: 308, height: 34 });

    const select = span(score, 1);
    assert.ok(near(frames.at(select.A - 1, 320, 158), [0, 0, 0]));
    assert.ok(near(frames.at(select.A, 320, 158), [0, 0, 255]), 'chosen when the pointer arrives');
    const tick = span(score, 2);
    assert.ok(near(frames.at(tick.A + 3, 320, 200), [0, 0, 0]));
    assert.ok(near(frames.at(tick.A + 4, 320, 200), [255, 255, 0]), 'ticked on the release frame');
  });

  it('scrolls as the shared maths says, to positions, targets and inside panels', async () => {
    const steps = [
      { do: 'scroll', to: 600, duration: 1, hold: 0.2 },
      { do: 'scroll', to: 'text=Pricing', align: 'start', duration: 0.5, hold: 0.2 },
      { do: 'scroll', by: -200, duration: 0.2, hold: 0.2, ease: 'linear' },
      { do: 'click', target: 'text=Contact us', duration: 0.5, hold: 0.2 },
    ];
    const { frames, score, track } = await rec({ url: `${site.url}/long.html`, steps });
    const first = span(score, 0);
    const at = new Map(track.scroll.map(([t, y]) => [Math.round(t * 30), y]));
    for (let n = first.S; n <= first.A; n++) {
      const want = scrollAt(0, 600, (n - first.S) / (first.A - first.S), 'ease-in-out');
      // The red ruler lies at 300 px of the page, the blue one at 700.
      const [ruler, top] = want <= 295 ? [isRed, 300] : [isBlue, 700];
      const box = frames.box(n, (rgb, x) => ruler(rgb));
      // Whole pixels in the page, and colour at half resolution in the file: 2 px of slack.
      if (top - want < 350)
        assert.ok(Math.abs(box[1] - (top - want)) <= 2, `frame ${n}: ruler at ${box[1]}`);
      if (at.has(n)) assert.ok(Math.abs(at.get(n) - want) <= 0.6, `frame ${n}: track ${at.get(n)}`);
    }
    assert.equal(track.scroll.at(0)[1], 0);
    const positions = track.scroll.map(([, y]) => y);
    assert.ok(positions.includes(600) && positions.includes(1000) && positions.includes(800));
    const linear = span(score, 2);
    assert.equal(at.get(linear.S + 3), 900, 'half way through a linear scroll');
    // A click on something below the fold brings it to the middle while the pointer travels.
    const click = track.steps[3];
    assert.ok(
      Math.abs(click.rect.y + click.rect.height / 2 - 180) < 100,
      JSON.stringify(click.rect),
    );
    assert.ok(click.point.y > 60 && click.point.y < 300, 'the pointer ended inside the picture');

    const panel = await rec({
      url: `${site.url}/app.html`,
      steps: [{ do: 'click', target: 'text=Deep in the panel', duration: 0.4, hold: 0.3 }],
    });
    const deep = span(panel.score, 0);
    const { rect, point } = panel.track.steps[0];
    assert.ok(rect.y > 60 && rect.y < 300, `the panel scrolled the button into view: ${rect.y}`);
    const lampAt = [Math.round(rect.x + 220), Math.round(rect.y + 20)];
    assert.ok(near(panel.frames.at(deep.A + 4, ...lampAt), [255, 255, 0]), 'and the click landed');
    assert.ok(point.x > 120, 'inside the panel, not on the sidebar');
  });

  it('honours the colour scheme, the device scale and other frame rates', async () => {
    const dark = await rec(
      {
        url: `${site.url}/`,
        colorScheme: 'dark',
        scale: 1.5,
        viewport: { width: 481, height: 271 },
      },
      { fps: 25 },
    );
    assert.ok(near(dark.frames.at(0, 450, 250), [16, 16, 16], 6), `${dark.frames.at(0, 450, 250)}`);
    // 481 × 271 at 1.5 is 722 × 407 device pixels; the file keeps the even part.
    assert.deepEqual([dark.track.width, dark.track.height, dark.track.fps], [722, 406, 25]);
    assert.equal(dark.frames.count, dark.score.frames);
    assert.equal(dark.score.frames, 10, '0.4 s at 25 fps');
    const xs = [0, 1, 2].map((n) => dark.frames.box(n, (rgb) => isRed(rgb))[0] / 1.5);
    assert.ok(
      Math.abs(xs[1] - xs[0] - 12) <= 1.5 && Math.abs(xs[2] - xs[1] - 12) <= 1.5,
      `600 px in 2 s is 12 px a frame at 25 fps: ${xs}`,
    );
  });
});
