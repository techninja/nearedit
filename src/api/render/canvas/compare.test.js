import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFrameSource, renderFrame } from '../../compose/index.js';
import { run } from '../../lib/ffmpeg.js';
import * as kit from '../testkit.js';

/**
 * What you preview is what renders: frames decoded from a rendered video
 * are compared with `renderFrame` — the compositor as the preview runs it —
 * of the same document at the same moment.
 *
 * Encoded without loss (an internal option) the two must be identical in
 * every byte. Encoded for real (H.264, 4:2:0) they cannot be: the tolerance
 * for that is stated and justified at the bottom of this file.
 */

const { createClip, createEdl, createTrack } = kit;
const [W, H, FPS] = [320, 180, 30];
const SECONDS = 2;

/**
 * Tolerance for frames that went through the real encoder, on the luma
 * plane (0..255), where 4:2:0 chroma subsampling plays no part.
 *
 * `mean`: largest mean absolute error of a frame against the compositor.
 * What is left after a correct render is H.264 quantisation: measured worst
 * over these documents 1.9 (standard, CRF 20), 1.4 (high, CRF 16) and 8.3
 * (draft: CRF 28 on a 160x90 picture). A wrong colour matrix or range moves
 * saturated areas by 10 to 20 levels and fails this by a wide margin.
 *
 * `apart`: how many times farther a frame must be from the compositor's
 * picture of either neighbouring frame than from its own (measured at least
 * 1.8 and 2.1), so an offset by one frame fails. Draft is too coarse for
 * that test at this size; its timing is covered by the lossless tests and
 * by the numbered-frame tests in `frames.test.js`.
 */
const TOLERANCE = {
  draft: { mean: 11, apart: 0 },
  standard: { mean: 3, apart: 1.4 },
  high: { mean: 2.5, apart: 1.6 },
};
/** Mean RGB difference allowed where FFmpeg, not the canvas, halves footage (measured 2.1). */
const HALF_SIZE_FOOTAGE = 3;

const gen = (type, params, more = {}) =>
  createClip({
    timelineStart: 0,
    timelineEnd: SECONDS,
    generator: { type, seed: 5, params },
    ...more,
  });
const fx = (type, params) => ({ effectId: `fx_${type}`, type, enabled: true, params });
const keys = (...pairs) => pairs.map(([t, v, ease = 'linear']) => ({ t, v, ease }));
const doc = (layers, more = {}) =>
  createEdl({
    resolution: `${W}x${H}`,
    fps: FPS,
    tracks: [
      ...layers.map((layer) =>
        createTrack('video', Array.isArray(layer) ? { clips: layer } : layer),
      ),
      createTrack('audio'),
    ],
    ...more,
  });
const sky = () =>
  gen(
    'gradient',
    { color1: '#0f172a', color2: '#f97316' },
    {
      keyframes: { 'generator.params.angle': keys([0, 0], [SECONDS, 300]) },
    },
  );
const ball = (more = {}) =>
  gen(
    'shape',
    { shape: 'ellipse', width: 90, height: 90, fill: '#22d3ee' },
    {
      keyframes: { 'transform.x': keys([0, -120, 'ease-in-out'], [SECONDS, 120]) },
      ...more,
    },
  );

/** The documents: one per thing the comparison has to catch. */
function documents(footage) {
  const film = (id, start, end, more = {}) =>
    createClip({
      clipId: id,
      sourceFile: footage,
      timelineStart: start,
      timelineEnd: end,
      ...more,
    });
  const caption = createClip({
    ...{ timelineStart: 0.2, timelineEnd: 1.8, fadeOut: 0.3 },
    text: {
      ...{ content: 'Same\nframes', fontSize: 44, fontFamily: 'Bebas Neue', outlineWidth: 2 },
      animateIn: { type: 'slide-up', by: 'char', duration: 0.4, stagger: 0.05 },
    },
    keyframes: { 'text.color': keys([0, '#ffffff'], [1.6, '#facc15']) },
  });
  const spin = {
    'transform.rotation': keys([0, 0, 'back-out'], [SECONDS, 270]),
    'transform.scaleX': keys([0, 0.3], [1, 1.2, 'bounce-out'], [SECONDS, 0.5]),
    'transform.y': keys([0, -40, 'sine'], [SECONDS, 40]),
  };
  return {
    generators: doc([
      [gen('particles', { rate: 60, size: 10 })],
      [
        gen(
          'pattern',
          { pattern: 'checker', size: 30, speedX: 45, speedY: 20 },
          { transform: { opacity: 0.5 } },
        ),
      ],
      [sky()],
    ]),
    'title over footage': doc([[caption], [film('a', 0, SECONDS, { sourceIn: 0.5 })]]),
    effects: doc([
      [ball({ effects: [fx('glow', { radius: 14, intensity: 1.5 }), fx('blur', { radius: 3 })] })],
      [
        gen(
          'pattern',
          { pattern: 'stripes', size: 24, speedX: 30 },
          { effects: [fx('blur', { radius: 5 })] },
        ),
      ],
    ]),
    'blend modes': doc([
      [ball({ blendMode: 'difference' })],
      [gen('pattern', { pattern: 'dots', size: 40, speedY: 50 }, { blendMode: 'screen' })],
      [film('a', 0, SECONDS, { blendMode: 'multiply' })],
      [sky()],
    ]),
    'keyframed transform': doc([[film('a', 0, SECONDS, { keyframes: spin })], [sky()]]),
    'cross-fade': doc([
      [
        film('a', 0, 1.2, { fadeOut: 0.6, fadeOutCurve: 'smooth' }),
        film('b', 0.6, SECONDS, {
          sourceIn: 1.5,
          fadeIn: 0.6,
          fadeInCurve: 'smooth',
          fadeOut: 0.4,
        }),
      ],
      [sky()],
    ]),
    'track opacity': doc(
      [
        { clips: [ball()], opacity: 0.6, effects: [fx('blur', { radius: 2 })] },
        { clips: [film('a', 0, SECONDS)], opacity: 0.45, blendMode: 'screen' },
        [sky()],
      ],
      { background: '#1d4ed8' },
    ),
  };
}

describe('canvas path: rendered frames equal the compositor', () => {
  const tmp = kit.scratch();
  const footage = join(tmp.dir, 'film.mp4');
  /** @type {Buffer} Every frame of the footage, decoded here and not by the renderer */
  let film;
  /** @type {Record<string, any>} */
  let docs;

  /** The compositor's own picture of a frame, with footage frames chosen by this test. */
  const reference = (edl, frame, width = W) => {
    const sources = new Map();
    const frameOf = (clip, sourceTime) => {
      const index = Math.round(sourceTime * FPS);
      const bytes = film.subarray(index * W * H * 4, (index + 1) * W * H * 4);
      if (!sources.has(clip.clipId)) sources.set(clip.clipId, createFrameSource(W, H));
      return sources.get(clip.clipId).put(bytes);
    };
    return renderFrame(edl, frame / FPS, { width, frameOf }).data();
  };
  /** Largest and mean difference between a decoded frame and RGBA reference pixels. */
  const differ = (frames, n, rgba) => {
    let [max, sum] = [0, 0];
    const { width, height } = frames;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const got = frames.at(n, x, y);
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(got[c] - rgba[(y * width + x) * 4 + c]);
          sum += d;
          if (d > max) max = d;
        }
      }
    }
    return { max, mean: sum / (width * height * 3) };
  };
  const shoot = async (edl, options, width = W) => {
    const { output } = await kit.draw(edl, tmp.dir, options);
    const height = (width * H) / W;
    return { ...(await kit.readFrames(output, width, height)), width, height };
  };

  before(async () => {
    // Lossless RGB, every frame different: decoding it adds nothing of its own.
    const exact = ['-c:v', 'libx264rgb', '-qp', '0', '-pix_fmt', 'rgb24'];
    await kit.generate(footage, [`testsrc2=s=${W}x${H}:r=${FPS}:d=4,hue=h=t*90`], exact);
    const raw = ['-hide_banner', '-loglevel', 'error', '-i', footage, '-f', 'rawvideo'];
    film = (await run('ffmpeg', [...raw, '-pix_fmt', 'rgba', '-'], { binary: true })).stdout;
    assert.equal(film.length, 120 * W * H * 4);
    docs = documents(footage);
  });
  after(() => tmp.cleanup());

  it('is identical, byte for byte, when encoded without loss', async () => {
    for (const [name, edl] of Object.entries(docs)) {
      const frames = await shoot(edl, { lossless: true });
      assert.equal(frames.count, SECONDS * FPS, name);
      let apart = Infinity;
      for (let n = 0; n < frames.count; n++) {
        const { max } = differ(frames, n, reference(edl, n));
        assert.equal(max, 0, `${name}, frame ${n}: differs from the compositor by ${max}`);
        if (n > 0) apart = Math.min(apart, differ(frames, n, reference(edl, n - 1)).mean);
      }
      // No frame could pass for its neighbour: an offset by one cannot hide.
      assert.ok(apart > 0.05, `${name}: neighbouring frames differ by at least ${apart}`);
    }
  });

  it('draws the same picture at half size (the draft preset)', async () => {
    for (const [name, edl] of Object.entries(docs)) {
      const frames = await shoot(edl, { lossless: true, preset: 'draft' }, W / 2);
      const hasFootage = edl.tracks.some((track) => track.clips.some((clip) => clip.sourceFile));
      for (let n = 0; n < frames.count; n += 3) {
        const { max, mean } = differ(frames, n, reference(edl, n, W / 2));
        // Footage is reduced by FFmpeg's scaler before it reaches the canvas —
        // the same place, a slightly different resampling than the canvas's own.
        if (hasFootage) assert.ok(mean < HALF_SIZE_FOOTAGE, `${name}, frame ${n}: mean ${mean}`);
        else assert.equal(max, 0, `${name}, frame ${n}: differs by ${max}`);
      }
    }
  });

  it('catches a wrong layer order and a missing effect', async () => {
    const edl = docs.effects;
    const frames = await shoot(edl, { lossless: true });
    const swapped = { ...edl, tracks: [edl.tracks[1], edl.tracks[0], edl.tracks[2]] };
    const bare = {
      ...edl,
      tracks: edl.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({ ...clip, effects: [] })),
      })),
    };
    assert.ok(differ(frames, 30, reference(swapped, 30)).max > 60, 'layer order shows');
    assert.ok(differ(frames, 30, reference(bare, 30)).max > 20, 'missing effects show');
    assert.equal(differ(frames, 30, reference(edl, 30)).max, 0);
  });

  it('stays within tolerance through the real encoder, at every preset', async () => {
    /** BT.709 luma of RGBA pixels, full range — what `-pix_fmt gray` decodes to. */
    const luma = (rgba) => {
      const out = new Float32Array(rgba.length / 4);
      for (let i = 0; i < out.length; i++)
        out[i] = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
      return out;
    };
    const apart = (gray, n, size, want) => {
      let sum = 0;
      for (let i = 0; i < size; i++) sum += Math.abs(gray[n * size + i] - want[i]);
      return sum / size;
    };
    for (const [preset, width] of [
      ['draft', W / 2],
      ['standard', W],
      ['high', W],
    ]) {
      for (const [name, edl] of Object.entries(docs)) {
        const { output } = await kit.draw(edl, tmp.dir, { preset });
        const args = ['-hide_banner', '-loglevel', 'error', '-i', output, '-f', 'rawvideo'];
        const gray = (await run('ffmpeg', [...args, '-pix_fmt', 'gray', '-'], { binary: true }))
          .stdout;
        const size = (width * width * H) / W;
        assert.equal(gray.length, SECONDS * FPS * size, `${preset} ${name}`);
        const limit = TOLERANCE[preset];
        for (let n = 1; n < SECONDS * FPS - 1; n += 2) {
          const own = apart(gray, n, size, luma(reference(edl, n, width)));
          const at = `${preset}, ${name}, frame ${n}`;
          assert.ok(own <= limit.mean, `${at}: mean luma error ${own.toFixed(2)}`);
          if (!limit.apart) continue;
          for (const other of [n - 1, n + 1]) {
            const wrong = apart(gray, n, size, luma(reference(edl, other, width)));
            const message = `${at}: ${(wrong / own).toFixed(2)}x closer to itself than to frame ${other}`;
            assert.ok(wrong >= own * limit.apart, message);
          }
        }
      }
    }
  });
});
