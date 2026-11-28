import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cutoutTime } from '#utils/cutout/index.js';
import { createFrameSource, renderFrame } from '../compose/index.js';
import { run } from '../lib/ffmpeg.js';
import { cutoutFiles, cutoutWarnings, settleCutouts } from './cutouts.js';
import { mapMediaPaths } from './mediaPaths.js';
import { prepareRender } from './prepare.js';
import { renderSegments } from './segments.js';
import * as kit from './testkit.js';

/**
 * A clip drawn through its matte, rendered: the frames of the video equal
 * the compositor's own picture of the same moments, with the cutout's
 * frames chosen by this test (`cutoutTime`) and not by the renderer.
 */

const { createClip, createEdl, createTrack } = kit;
const [W, H, FPS] = [320, 180, 30];
const KEY = '0a51bd39df6c629f93d1';
const exact = ['-c:v', 'libx264rgb', '-qp', '0', '-pix_fmt', 'rgb24'];
/** Every frame different: colours that turn, with the frame number in it. */
const PICTURE = `testsrc2=s=${W}x${H}:r=${FPS}:d=4,hue=h=t*90`;
/** A soft-edged disc that crosses the picture: white on black. */
const MATTE =
  `color=black:s=${W}x${H}:r=${FPS}:d=4,format=gray,` +
  `geq=lum='255*lt(hypot(X-(60+50*T),Y-90),55)',gblur=sigma=1.2,format=gbrp`;

describe('person cutout in a render', () => {
  const tmp = kit.scratch();
  const film = join(tmp.dir, 'film.mp4');
  const packed = join(tmp.dir, `${KEY}.mp4`);
  /** The cutout holds 0.2 … 3.2 s of the film: its frame 0 is the film's frame 6. */
  const made = {
    ...{ file: packed, key: KEY, source: film, start: 0.2, end: 3.2 },
    ...{ fps: FPS, width: W, height: H, frames: 90 },
  };
  /** @type {Buffer} */
  let filmFrames;
  /** @type {Buffer} */
  let packedFrames;

  /** Me (0.5 s into the film, so one second into… 0.3 s into the cutout) over a gradient. */
  const doc = (cutout, more = {}) =>
    createEdl({
      resolution: `${W}x${H}`,
      fps: FPS,
      tracks: [
        createTrack('video', {
          clips: [
            createClip({
              ...{ clipId: 'me', sourceFile: film, sourceIn: 0.5, sourceOut: 2.5 },
              ...{ timelineStart: 0, timelineEnd: 2, cutout, ...more },
            }),
          ],
        }),
        createTrack('video', {
          clips: [
            createClip({
              ...{ clipId: 'sky', timelineStart: 0, timelineEnd: 2 },
              generator: { type: 'gradient', seed: 1, params: { color1: '#0f172a' } },
            }),
          ],
        }),
        createTrack('audio'),
      ],
    });
  const ready = (settings = {}, more = {}) => doc({ on: true, ...settings, made }, more);

  /** The compositor's picture of a frame, fed by this test. */
  const reference = (edl, frame, width = W) => {
    const sources = new Map();
    const frameOf = (clip, sourceTime) => {
      const cut = clip.cutout?.made;
      const index = cut ? cutoutTime(cut, sourceTime).frame : Math.round(sourceTime * FPS);
      const wide = cut ? W * 2 : W;
      const bytes = (cut ? packedFrames : filmFrames).subarray(
        index * wide * H * 4,
        (index + 1) * wide * H * 4,
      );
      if (!sources.has(wide)) sources.set(wide, createFrameSource(wide, H));
      return sources.get(wide).put(bytes);
    };
    return renderFrame(edl, frame / FPS, { width, frameOf }).data();
  };
  const differ = (frames, n, rgba, width = W) => {
    let [max, sum] = [0, 0];
    const height = (width * H) / W;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const got = frames.at(n, x, y);
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(got[c] - rgba[(y * width + x) * 4 + c]);
          sum += d;
          max = Math.max(max, d);
        }
      }
    }
    return { max, mean: sum / (width * height * 3) };
  };
  const shoot = async (edl, options = {}, width = W) => {
    const { output } = await kit.draw(edl, tmp.dir, { lossless: true, ...options });
    return kit.readFrames(output, width, (width * H) / W);
  };

  before(async () => {
    await kit.generate(film, [PICTURE], exact);
    const cut = 'trim=start_frame=6,setpts=PTS-STARTPTS';
    const graph = `[0:v]${cut}[p];[1:v]${cut}[m];[p][m]hstack=inputs=2,trim=end_frame=90`;
    await kit.generate(packed, [PICTURE, MATTE], ['-filter_complex', graph, ...exact]);
    const raw = (file) =>
      run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {
        binary: true,
      });
    filmFrames = (await raw(film)).stdout;
    packedFrames = (await raw(packed)).stdout;
    assert.equal(packedFrames.length, 90 * W * 2 * H * 4);
  });
  after(() => tmp.cleanup());

  it('keeps the cutouts that can be used and takes the rest off their clips', () => {
    const edl = ready();
    const here = (file) => file === packed;
    assert.equal(settleCutouts(edl, here), edl, 'ready and there: nothing changes');
    assert.deepEqual(cutoutFiles(edl), [packed]);
    assert.deepEqual(cutoutWarnings(edl), []);
    const stripped = (changed) => changed.tracks[0].clips[0].cutout;
    for (const [why, bad, exists] of [
      ['the file is gone', edl, () => false],
      ['trimmed beyond it', ready({}, { sourceIn: 2, sourceOut: 4 }), here],
      ['made at another rate', { ...edl, fps: 25 }, here],
      ['of another file', doc({ on: true, made: { ...made, source: '/other.mp4' } }), here],
    ]) {
      const settled = settleCutouts(bad, exists);
      assert.deepEqual(Object.keys(stripped(settled)), ['on'], why);
      assert.equal(stripped(settled).on, true, 'cutout stays on: the editor still knows');
      assert.deepEqual(cutoutFiles(settled), [], why);
      assert.match(cutoutWarnings(settled)[0], /^Cut out person is on for .*film\.mp4, but/, why);
      assert.equal(settled.tracks[1], bad.tracks[1], 'untouched tracks are shared');
    }
    const off = doc({ on: false, made });
    assert.deepEqual([cutoutFiles(off), cutoutWarnings(off)], [[], []], 'off is off');
  });

  it('routes a ready cutout to the compositor, and says why', async () => {
    const reasons = (edl, options) => renderSegments(edl, options).map((s) => s.reasons);
    assert.deepEqual(reasons(ready()), [['cutout', 'generator']]);
    assert.deepEqual(reasons(settleCutouts(ready(), () => false)), [['generator']]);
    assert.throws(() => reasons(ready(), { engine: 'ffmpeg' }), /it has .*a person cutout/);
    const { probes, warnings } = await prepareRender(ready());
    assert.equal(probes[packed].width, W * 2, 'the cutout file is probed with the sources');
    assert.deepEqual(warnings, []);
    const waiting = await prepareRender(settleCutouts(ready(), () => false));
    assert.equal(waiting.warnings.length, 1);
    assert.equal(waiting.probes[packed], undefined);
  });

  it('resolves the cutout file with the other paths of a document', () => {
    const edl = ready();
    const seen = [];
    const moved = mapMediaPaths(edl, (path, where) => (seen.push(where), `/x${path}`));
    assert.deepEqual(moved.tracks[0].clips[0].cutout.made, {
      ...made,
      ...{ file: `/x${packed}`, source: `/x${film}` },
    });
    assert.ok(seen.includes('tracks[0].clips[0].cutout.made.file'));
    const refused = mapMediaPaths(edl, (path, where) => (where.includes('cutout') ? '' : path));
    assert.deepEqual(refused.tracks[0].clips[0].cutout, { on: true });
  });

  it('renders the frames the compositor draws, byte for byte, from a clip that starts mid-cutout', async () => {
    const cases = {
      remove: ready(),
      'blur, feathered': ready({ mode: 'blur', feather: 2, blur: 6 }),
      'moved, with an outline and a shadow': ready(
        { shrink: 0.5 },
        {
          // Not reduced: FFmpeg's reduction of a clip shown small is the next test.
          transform: { scaleX: 1.1, scaleY: 1.1, x: 40, y: 20, rotation: 5 },
          effects: [
            { effectId: 'o', type: 'outline', enabled: true, params: { width: 2 } },
            { effectId: 's', type: 'dropShadow', enabled: true, params: { blur: 4 } },
          ],
        },
      ),
    };
    for (const [name, edl] of Object.entries(cases)) {
      const frames = await shoot(edl);
      assert.equal(frames.count, 2 * FPS, name);
      let apart = Infinity;
      for (let n = 0; n < frames.count; n++) {
        const { max } = differ(frames, n, reference(edl, n));
        assert.equal(max, 0, `${name}, frame ${n}: differs from the compositor by ${max}`);
        if (n > 0) apart = Math.min(apart, differ(frames, n, reference(edl, n - 1)).mean);
      }
      assert.ok(apart > 0.05, `${name}: an offset by one frame would show (${apart})`);
    }
    // The person is there and the background is not: the disc's middle, a far corner.
    const seen = await shoot(cases.remove, { range: { start: 1, end: 1.1 } });
    const plain = await shoot(doc(undefined), { range: { start: 1, end: 1.1 } });
    const disc = [Math.round(60 + 50 * 1.5), 90];
    assert.deepEqual(seen.at(0, ...disc), plain.at(0, ...disc), 'the picture inside the matte');
    assert.notDeepEqual(seen.at(0, 300, 20), plain.at(0, 300, 20), 'the gradient outside it');
  });

  it('draws the same picture when FFmpeg reduces the cutout file (draft)', async () => {
    const edl = ready();
    const frames = await shoot(edl, { preset: 'draft' }, W / 2);
    for (let n = 0; n < frames.count; n += 6) {
      const { mean } = differ(frames, n, reference(edl, n, W / 2), W / 2);
      assert.ok(mean < 3, `frame ${n}: mean ${mean}`);
    }
    // Neither half bleeds into the other where they were cut apart: the
    // picture's last column shows the film, not the matte beside it.
    const right = [W / 2 - 1, 45];
    const bright = frames.at(15, ...right);
    assert.ok(Math.max(...bright) > 40, `the right edge is not darkened: ${bright}`);
  });

  it('renders a clip whose cutout is out of date as its plain picture', async () => {
    const stale = settleCutouts(ready({}, { sourceIn: 2, sourceOut: 4 }), () => true);
    assert.deepEqual(
      renderSegments(stale).map((s) => s.reasons),
      [['generator']],
    );
    const frames = await shoot(stale, { range: { start: 0, end: 0.2 } });
    const plain = await shoot(doc(undefined, { sourceIn: 2, sourceOut: 4 }), {
      range: { start: 0, end: 0.2 },
    });
    for (const at of [
      [10, 10],
      [160, 90],
      [300, 170],
    ])
      assert.deepEqual(frames.at(3, ...at), plain.at(3, ...at));
  });
});
