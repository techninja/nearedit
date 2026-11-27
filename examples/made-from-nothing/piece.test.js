import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clipKind, validateEdl } from '#utils/edl/index.js';
import { requirements } from '#utils/compose/index.js';
import { renderFrame } from '../../src/api/compose/index.js';
import { buildPiece } from './piece.js';

const saved = JSON.parse(
  readFileSync(new URL('./made-from-nothing.json', import.meta.url), 'utf8'),
);

/** Share of pixels that are not near-black, sampled. */
function lit(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 0; i < data.length; i += 16) if (data[i] + data[i + 1] + data[i + 2] > 60) count++;
  return count / (data.length / 16);
}

describe('example: made from nothing', () => {
  const doc = buildPiece();
  const clips = doc.tracks.flatMap((track) => track.clips);

  it('builds a valid document, the same every time', () => {
    assert.deepEqual(validateEdl(doc).problems, []);
    assert.deepEqual(buildPiece(), doc);
  });

  it('is the document saved beside it (run build.js after changing a scene)', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), saved);
  });

  it('uses no media at all: only generators and text', () => {
    assert.equal(clips.length, 25);
    assert.ok(clips.every((clip) => !clip.sourceFile));
    assert.deepEqual([...new Set(clips.map(clipKind))].sort(), ['generator', 'title']);
    assert.deepEqual(requirements(doc).images, []);
  });

  it('runs 25 seconds with keyframes and effects in every scene', () => {
    assert.equal(Math.max(...clips.map((clip) => clip.timelineEnd)), 25);
    for (const from of [0, 5, 10, 15, 20]) {
      const scene = clips.filter((c) => c.timelineStart >= from && c.timelineStart < from + 5);
      assert.ok(scene.length >= 4, `scene at ${from} s has ${scene.length} layers`);
      assert.ok(
        scene.some((clip) => Object.keys(clip.keyframes).length),
        `scene at ${from} s has no keyframes`,
      );
      assert.ok(
        scene.some((clip) => clip.effects.length),
        `scene at ${from} s has no effects`,
      );
    }
  });

  it('draws: every scene puts a picture on the frame', async () => {
    for (const time of [2.5, 7.5, 12.5, 17.5, 22.5]) {
      const canvas = await renderFrame(doc, time, { width: 320, height: 180 });
      assert.ok(lit(canvas) > 0.2, `frame at ${time} s is mostly black`);
    }
  });
});
