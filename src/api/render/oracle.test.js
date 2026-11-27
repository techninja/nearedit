import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { clipProgress, placeSource, resolveTransform } from '#utils/edl/geometry.js';
import { clipGain, videoOpacity } from '#utils/edl/levels.js';
import * as kit from './testkit.js';

/**
 * The preview draws with the shared EDL maths. These tests use that same
 * maths as the oracle for rendered pixels and samples: whatever the
 * compositor shows for a clip, the render must show too.
 */

const { createClip, createEdl, createTrack } = kit;
const [W, H] = [320, 180];
const SOURCE = { width: 400, height: 100 };
const lit = (rgb) => rgb[0] > 60;

/** Clip a convex polygon to one side of an axis-aligned line (Sutherland–Hodgman). */
function clipSide(points, axis, limit, keepBelow) {
  const inside = (p) => (keepBelow ? p[axis] <= limit : p[axis] >= limit);
  const result = [];
  points.forEach((point, i) => {
    const prev = points[(i + points.length - 1) % points.length];
    if (inside(point) !== inside(prev)) {
      const k = (limit - prev[axis]) / (point[axis] - prev[axis]);
      result.push([prev[0] + (point[0] - prev[0]) * k, prev[1] + (point[1] - prev[1]) * k]);
    }
    if (inside(point)) result.push(point);
  });
  return result;
}

/** Bounding box [x0, y0, x1, y1] of the visible part of a placed, possibly rotated source. */
function expectedBox(t) {
  const p = placeSource(SOURCE.width, SOURCE.height, W, H, t);
  const angle = (t.rotation * Math.PI) / 180;
  const [ax, ay] = [p.dx + p.dw * t.anchorX, p.dy + p.dh * t.anchorY];
  const corners = [
    [p.dx, p.dy],
    [p.dx + p.dw, p.dy],
    [p.dx + p.dw, p.dy + p.dh],
    [p.dx, p.dy + p.dh],
  ];
  let shape = corners.map(([x, y]) => [
    ax + (x - ax) * Math.cos(angle) - (y - ay) * Math.sin(angle),
    ay + (x - ax) * Math.sin(angle) + (y - ay) * Math.cos(angle),
  ]);
  for (const [axis, limit, below] of [
    [0, 0, false],
    [0, W, true],
    [1, 0, false],
    [1, H, true],
  ])
    shape = clipSide(shape, axis, limit, below);
  const xs = shape.map((c) => c[0]);
  const ys = shape.map((c) => c[1]);
  return [
    Math.round(Math.min(...xs)),
    Math.round(Math.min(...ys)),
    Math.round(Math.max(...xs)) - 1,
    Math.round(Math.max(...ys)) - 1,
  ];
}

function isBox(actual, expected, label, tolerance) {
  const ok = actual && expected.every((v, i) => Math.abs(v - actual[i]) <= tolerance);
  assert.ok(ok, `${label}: rendered box ${actual}, shared maths says ${expected}`);
}

describe('render: agrees with the shared EDL maths the preview uses', () => {
  const tmp = kit.scratch();
  const file = (name) => join(tmp.dir, name);
  const edl = (...tracks) => createEdl({ resolution: `${W}x${H}`, fps: 30, tracks });
  const clip = (name, start, end, more = {}) =>
    createClip({
      ...{ sourceFile: file(name), sourceIn: 0, sourceOut: end - start },
      ...{ timelineStart: start, timelineEnd: end, ...more },
    });

  before(async () => {
    await kit.generate(file('wide.mp4'), ['color=red:s=400x100:r=30:d=3']);
    await kit.generate(file('tone.wav'), ['aevalsrc=0.5*sin(2*PI*440*t):s=48000:d=3']);
  });
  after(() => tmp.cleanup());

  it('places every transform where placeSource puts it', async () => {
    const transforms = [
      { fit: 'contain', scaleX: 0.5, scaleY: 0.5, x: 37, y: -21 },
      { fit: 'cover', scaleX: 0.3, scaleY: 0.6, x: -90, y: 40 },
      { fit: 'contain', cropLeft: 0.2, cropTop: 0.1, scaleX: 0.7, scaleY: 0.7 },
      { fit: 'cover', cropRight: 0.5, cropBottom: 0.3, scaleX: 0.5, scaleY: 0.5, x: 100 },
      { fit: 'contain', scaleX: 1.5, scaleY: 1.5, x: 200, y: 60 },
      { fit: 'contain', scaleX: 0.5, scaleY: 0.5, rotation: 35, x: 20 },
      { fit: 'contain', scaleX: 0.6, scaleY: 0.3, rotation: -70, anchorX: 0.2, anchorY: 0.9 },
      { fit: 'cover', scaleX: 0.2, scaleY: 0.2, rotation: 180, anchorX: 1, anchorY: 1, y: -30 },
    ];
    const clips = transforms.map((transform, i) =>
      clip('wide.mp4', i * 0.2, (i + 1) * 0.2, { transform }),
    );
    const { output } = await kit.render(edl(createTrack('video', { clips })), tmp.dir);
    const frames = await kit.readFrames(output, W, H);
    clips.forEach((placed, i) => {
      const t = resolveTransform(placed, 0);
      const label = `transform ${i} ${JSON.stringify(transforms[i])}`;
      isBox(frames.box(i * 6 + 3, lit), expectedBox(t), label, t.rotation ? 3 : 1);
    });
  });

  it('follows resolveTransform through a ken-burns move', async () => {
    const kenBurns = {
      ...{ enabled: true, startScale: 0.3, endScale: 0.8, startX: -60, endX: 50 },
      ...{ startY: 20, endY: -30 },
    };
    const moving = clip('wide.mp4', 0.5, 2.5, { transform: { fit: 'contain', kenBurns } });
    const turning = clip('wide.mp4', 0.5, 2.5, {
      transform: { fit: 'contain', rotation: 25, anchorX: 0.1, anchorY: 0.3, kenBurns },
    });
    // A moving crop changes the fit (here it flips from width- to height-bound).
    const crop = { enabled: true, startScale: 0.6, endScale: 0.6, startCropLeft: 0 };
    const cropping = clip('wide.mp4', 0.5, 2.5, {
      transform: { fit: 'contain', kenBurns: { ...crop, endCropLeft: 0.6 } },
    });
    for (const [name, placed, tolerance] of [
      ['pan and zoom', moving, 2],
      ['rotated', turning, 4],
      ['animated crop', cropping, 2],
    ]) {
      const { output } = await kit.render(edl(createTrack('video', { clips: [placed] })), tmp.dir);
      const frames = await kit.readFrames(output, W, H);
      for (const frame of [15, 22, 37, 45, 60, 68, 71, 74]) {
        const t = resolveTransform(placed, clipProgress(placed, frame / 30));
        isBox(frames.box(frame, lit), expectedBox(t), `${name}, frame ${frame}`, tolerance);
      }
    }
  });

  it('shows the opacity videoOpacity gives, times the transform opacity', async () => {
    const lone = clip('wide.mp4', 0, 2, { fadeIn: 0.6, fadeOut: 0.8, transform: { opacity: 0.7 } });
    const pair = [
      clip('wide.mp4', 0, 1.2, { fadeOut: 0.6 }),
      clip('wide.mp4', 0.6, 2, { fadeIn: 0.6, transform: { fit: 'contain', scaleY: 0.2 } }),
    ];
    for (const [name, clips, target] of [
      ['fades', [lone], lone],
      ['outgoing clip of a dissolve', pair, pair[0]],
    ]) {
      const track = createTrack('video', { clips });
      const { output } = await kit.render(edl(track), tmp.dir);
      const frames = await kit.readFrames(output, W, H);
      const last = Math.round(target.timelineEnd * 30) - 1;
      for (const frame of [0, 5, 9, 17, 21, 27, 33, last - 12, last - 3, last]) {
        if (frame > last) continue;
        // Sample the top of the frame, which the incoming strip of the pair never covers.
        const want = 254 * target.transform.opacity * videoOpacity(track, target, frame / 30);
        const got = frames.at(frame, 160, 20)[0];
        assert.ok(
          Math.abs(got - want) <= 7,
          `${name}, frame ${frame}: red ${got}, expected ${want.toFixed(0)}`,
        );
      }
    }
  });

  it('plays the gain clipGain gives', async () => {
    const faded = clip('tone.wav', 0, 2, { volume: 0.8, fadeIn: 0.5, fadeOut: 1 });
    const track = createTrack('audio', { volume: 0.6, clips: [faded] });
    const { output } = await kit.render(edl(track), tmp.dir, { preset: 'draft' });
    const { left } = await kit.readAudio(output);
    for (const t of [0.15, 0.25, 0.4, 0.7, 1.0, 1.25, 1.5, 1.75, 1.9]) {
      // The mean of a linear ramp over a window is its value at the centre.
      const want = 0.5 * clipGain(track, faded, t);
      const got = kit.tone(left, 440, t - 0.04, t + 0.04);
      assert.ok(
        Math.abs(got - want) <= 0.012,
        `at ${t}s: level ${got.toFixed(3)}, expected ${want.toFixed(3)}`,
      );
    }
  });
});
