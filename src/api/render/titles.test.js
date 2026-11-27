import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findFontFiles } from './fonts.js';
import * as kit from './testkit.js';

const { createClip, createEdl, createTrack } = kit;
const lit = (rgb) => rgb[0] + rgb[1] + rgb[2] > 150;
const centre = (box) => [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
const NASTY = `It's 50% "off": \\n [x];y,z %{pts} \\\\ 'q' 😀\nsecond: line=1:2`;

function isNear(actual, expected, label, tolerance = 3) {
  const ok = expected.every((v, i) => Math.abs(v - actual[i]) <= tolerance);
  assert.ok(ok, `${label}: got ${actual} expected ~${expected}`);
}

describe('render: titles', () => {
  const tmp = kit.scratch();
  const edl = (...tracks) => createEdl({ resolution: '320x180', fps: 30, tracks });
  const title = (text, more = {}) =>
    createClip({
      ...{ timelineStart: 0, timelineEnd: 1, ...more },
      text: { content: 'HELLO', fontSize: 40, ...text },
    });
  const shoot = async (document, options) => {
    const { output, plan } = await kit.render(document, tmp.dir, options);
    return { plan, frames: await kit.readFrames(output, plan.width, plan.height) };
  };
  const single = async (text, more, options) =>
    shoot(edl(createTrack('video', { clips: [title(text, more)] })), options);

  before(async () => {
    await kit.generate(join(tmp.dir, 'white.mp4'), ['color=white:s=320x180:r=30:d=1']);
  });
  after(() => tmp.cleanup());

  it('centres the text block and moves it by transform.x/y', async () => {
    const plain = (await single({})).frames;
    isNear(centre(plain.box(10, lit)), [160, 90], 'centred');
    assert.deepEqual(plain.at(10, 10, 10), [0, 0, 0], 'background untouched');
    const moved = (await single({}, { transform: { x: 60, y: -40 } })).frames;
    isNear(centre(moved.box(10, lit)), [220, 50], 'offset by x=60, y=-40');
    // The same vertical centre whatever the glyphs: no ascenders vs tall letters.
    const low = centre((await single({ content: 'xxxxx' })).frames.box(10, lit));
    const tall = centre((await single({ content: 'xxxxb' })).frames.box(10, lit));
    assert.ok(tall[1] < low[1], `ascender raises the ink centre (${tall[1]} < ${low[1]})`);
  });

  it('draws colour, background box and outline', async () => {
    const { frames } = await single({ color: '#ffff00', background: '#0000ff' });
    const yellow = frames.box(10, (rgb) => rgb[0] > 180 && rgb[1] > 180 && rgb[2] < 110);
    const blue = frames.box(10, (rgb) => rgb[2] > 180 && rgb[0] < 80 && rgb[1] < 80);
    assert.ok(yellow && blue, 'text is yellow on a blue box');
    isNear(centre(blue), [160, 90], 'box is centred');
    // The box is the text plus 0.2 x fontSize (8px) of padding on every side.
    assert.ok(Math.abs(yellow[0] - blue[0] - 8) <= 4, `box padding: text ${yellow} box ${blue}`);
    isNear(frames.at(10, blue[0] - 6, 90), [0, 0, 0], 'nothing outside the box', 4);
    const outlined = await single({ color: '#000000', outlineColor: '#ff0000', outlineWidth: 3 });
    const ring = outlined.frames.box(10, (rgb) => rgb[0] > 150 && rgb[1] < 60);
    assert.ok(ring, 'black text gets a visible red outline');
  });

  it('keeps hostile text out of the graph and draws it literally', async () => {
    const { plan, frames } = await single({ content: NASTY, fontSize: 14 });
    assert.ok(!plan.filterComplex.includes('second'), 'text is not in the graph');
    assert.ok(!plan.args.join(' ').includes('50%'), 'text is not in the arguments');
    const textFile = plan.files.find((f) => f.path.endsWith('.txt'));
    assert.equal(textFile.content, NASTY);
    assert.equal(readFileSync(textFile.path, 'utf8'), NASTY);
    const box = frames.box(10, lit);
    assert.ok(box[2] - box[0] > 150, `the long first line is drawn: ${box}`);
    assert.ok(box[3] - box[1] > 20, `on two lines: ${box}`);
  });

  it('aligns the lines of multi-line text', async () => {
    const lower = async (align) => {
      const { frames } = await single({ content: 'WWWWWW\ni', align });
      const block = frames.box(10, lit);
      const middle = Math.round((block[1] + block[3]) / 2) + 6;
      const second = frames.box(10, (rgb) => lit(rgb));
      let [left, right] = [999, -1];
      for (let y = middle; y <= second[3]; y++) {
        for (let x = 0; x < 320; x++) {
          if (!lit(frames.at(10, x, y))) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
      return { block, left, right };
    };
    const l = await lower('left');
    const c = await lower('center');
    const r = await lower('right');
    assert.ok(l.left - l.block[0] <= 6, `left: short line starts at the block's left edge`);
    assert.ok(r.block[2] - r.right <= 6, `right: short line ends at the block's right edge`);
    isNear([(c.left + c.right) / 2], [160], 'center: short line is centred', 4);
    assert.ok(r.left - l.left > 60, 'left and right alignment differ');
  });

  it('applies opacity and fades, with clean edges over video', async () => {
    const ghost = (await single({}, { transform: { opacity: 0.5 } })).frames;
    const peak = (frames, n) => {
      const box = frames.box(n, (rgb) => rgb[0] > 20);
      let max = 0;
      for (let y = box[1]; y <= box[3]; y++)
        for (let x = box[0]; x <= box[2]; x++) max = Math.max(max, frames.at(n, x, y)[0]);
      return max;
    };
    assert.ok(Math.abs(peak(ghost, 10) - 127) <= 10, `half opacity peak ${peak(ghost, 10)}`);
    const fading = (await single({}, { fadeIn: 0.5, fadeOut: 0.5, timelineEnd: 2 })).frames;
    assert.equal(fading.box(0, (rgb) => rgb[0] > 20), null, 'invisible on the first frame');
    assert.ok(Math.abs(peak(fading, 8) - 136) <= 14, `mid fade-in ${peak(fading, 8)}`);
    assert.ok(peak(fading, 30) >= 245, 'fully visible in the middle');
    assert.ok(Math.abs(peak(fading, 52) - 136) <= 14, `mid fade-out ${peak(fading, 52)}`);
    // White text on white video: any halo around the glyphs would show as grey.
    const white = createClip({
      ...{ sourceFile: join(tmp.dir, 'white.mp4'), sourceOut: 1, timelineEnd: 1 },
    });
    const over = await shoot(
      edl(
        createTrack('video', { clips: [title({ color: '#ffffff' })] }),
        createTrack('video', { clips: [white] }),
      ),
    );
    assert.equal(over.frames.box(10, (rgb) => rgb[0] < 240), null, 'no dark fringe');
  });

  it('scales and rotates a title', async () => {
    const size = (box) => [box[2] - box[0] + 1, box[3] - box[1] + 1];
    const base = size((await single({ content: 'IIIIIIII', fontSize: 20 })).frames.box(10, lit));
    const doubled = await single({ content: 'IIIIIIII', fontSize: 20 }, { transform: { scaleX: 2, scaleY: 2 } });
    const big = size(doubled.frames.box(10, lit));
    isNear(big, [base[0] * 2, base[1] * 2], 'scale 2 doubles the text', 5);
    const stretched = await single({ content: 'IIIIIIII', fontSize: 20 }, { transform: { scaleX: 2 } });
    const wide = size(stretched.frames.box(10, lit));
    isNear(wide, [base[0] * 2, base[1]], 'scaleX 2 stretches it', 5);
    const turned = await single({ content: 'IIIIIIII', fontSize: 20 }, { transform: { rotation: 90, x: 50 } });
    const box = turned.frames.box(10, lit);
    isNear(size(box), [base[1], base[0]], 'rotated 90°: width and height swap', 4);
    isNear(centre(box), [210, 90], 'rotated about its own centre, then offset');
    const draft = await single({ content: 'IIIIIIII', fontSize: 20 }, {}, { preset: 'draft' });
    isNear(size(draft.frames.box(10, lit)), [base[0] / 2, base[1] / 2], 'draft halves it', 3);
  });

  it('follows ken burns and font choices', async () => {
    const roll = { enabled: true, startY: 60, endY: -60 };
    const { frames } = await single({}, { timelineEnd: 2, transform: { kenBurns: roll } });
    isNear([centre(frames.box(0, lit))[1]], [150], 'starts low');
    isNear([centre(frames.box(30, lit))[1]], [90], 'passes the middle');
    isNear([centre(frames.box(59, lit))[1]], [32], 'ends high');
    const ink = async (text) => {
      const shot = (await single({ content: 'iiiiii', ...text })).frames;
      const box = shot.box(10, lit);
      let count = 0;
      for (let y = box[1]; y <= box[3]; y++)
        for (let x = box[0]; x <= box[2]; x++) count += lit(shot.at(10, x, y)) ? 1 : 0;
      return { count, width: box[2] - box[0] };
    };
    const regular = await ink({ bold: false });
    assert.ok((await ink({ bold: true })).count > regular.count * 1.15, 'bold has more ink');
    const mono = await ink({ bold: false, fontFamily: 'monospace' });
    assert.ok(mono.width > regular.width * 1.5, 'monospace sets "iiiiii" much wider than sans');
  });

  it('falls back to a font file when FFmpeg has no fontconfig', async () => {
    const fontFiles = findFontFiles();
    assert.ok(fontFiles['sans-serif']?.regular, 'a sans-serif font file is installed');
    const capabilities = { drawtext: true, textAlign: true, fontconfig: false, fontFiles };
    const { plan, frames } = await single({}, {}, { capabilities });
    assert.match(plan.filterComplex, /fontfile=\/[^:]+\.(ttf|otf|ttc):/, 'uses a font file path');
    isNear(centre(frames.box(10, lit)), [160, 90], 'drawn and centred');
  });
});
