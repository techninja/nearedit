/**
 * Captions make room for a brand overlay — the rule as the frame compositor
 * applies it, on the server canvas: what is in a group's way and what is
 * not, that a group is put in one place for as long as it is on screen,
 * that the place follows where the user put the overlay, and that a frame
 * of a group that was decided measures nothing again.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, renderFrame } from '../../src/api/compose/index.js';
import { normalizeDesign } from '../../src/utils/brand/element/index.js';
import { timelineCues } from '../../src/utils/captions/index.js';
import { drawFrame } from '../../src/utils/compose/drawFrame.js';
import { frameInfo } from '../../src/utils/compose/index.js';
import { createClip } from '../../src/utils/edl/factory.js';
import { patchCaptionStyle } from '../../src/utils/edl/index.js';
import { WORDS } from '../captions/scenes.js';
import { SAYING, spoken } from './cases/captions.js';
import { GROUP_START, LONG, SHORT, overlay, roomDocs } from './cases/captionsRoom.js';

const SIZE = { width: 480, height: 270 };
const FPS = 30;

/** RGBA of a frame; the talk's picture is not there, so captions are over black. */
function pixels(edl, time, size = SIZE) {
  const canvas = renderFrame(edl, time, { ...size, words: () => WORDS });
  return Buffer.from(canvas.getContext('2d').getImageData(0, 0, size.width, size.height).data);
}
/** The same document, said by nobody: no captions. */
const silent = (edl) => ({
  ...edl,
  tracks: edl.tracks.map((track) => (track.type === 'audio' ? { ...track, muted: true } : track)),
});
const unmoved = (edl) => patchCaptionStyle(edl, 'avoid', false);

/** The rows two frames differ in, as shares of the height: `[first, last]`, or null. */
function rowsBetween(a, b, { width, height } = SIZE) {
  let [top, bottom] = [-1, -1];
  for (let y = 0; y < height; y++) {
    if (
      a
        .subarray(y * width * 4, (y + 1) * width * 4)
        .equals(b.subarray(y * width * 4, (y + 1) * width * 4))
    )
      continue;
    if (top < 0) top = y;
    bottom = y;
  }
  return top < 0 ? null : [top / height, bottom / height];
}
/** Where the caption is in a frame. */
const captionRows = (edl, time, size) =>
  rowsBetween(pixels(edl, time, size), pixels(silent(edl), time, size), size);
/** Where the overlays are in a frame. */
const overlayRows = (edl, time) => {
  const bare = { ...edl, tracks: edl.tracks.filter((track) => track.trackId !== 'o0') };
  return rowsBetween(pixels(silent(edl), time), pixels(silent(bare), time));
};

const third = (extra = {}, slots = LONG) => overlay('clean', 'lower-third', slots, extra);
const over = (clip, style) => spoken({ style, over: [[clip]] }).edl;
const PLAIN = spoken().edl;
const NORMAL = captionRows(PLAIN, SAYING);

describe('captions make room for a brand overlay', () => {
  it('draws a group above a lower third that is in its way, a gap clear', () => {
    const edl = over(third());
    const [top, bottom] = captionRows(edl, SAYING);
    const [blockTop] = overlayRows(edl, SAYING);
    assert.ok(NORMAL[1] > blockTop, 'in its normal place the caption would be on the lower third');
    assert.ok(
      bottom < blockTop - 0.01,
      `its foot (${bottom}) is above the lower third (${blockTop})`,
    );
    assert.ok(blockTop - bottom < 0.05, 'and no further than it has to be');
    assert.ok(top > 0.5, 'still in the lower half of the frame');
  });

  it('leaves a caption alone that nothing comes near', () => {
    // A lower third with a short name ends well to the left of a short centred caption.
    const beside = over(third({}, SHORT));
    assert.ok(pixels(beside, SAYING).equals(pixels(unmoved(beside), SAYING)));
    // A logo in the top corner is nowhere near the foot of the frame.
    const bug = over(overlay('clean', 'bug', {}));
    assert.ok(pixels(bug, SAYING).equals(pixels(unmoved(bug), SAYING)));
    assert.deepEqual(captionRows(bug, SAYING), NORMAL);
  });

  it('decides once for a group: no caption moves while it is being read', () => {
    // The lower third leaves a tenth of a second into the group "37 features,".
    const leaving = over(third({ timelineEnd: GROUP_START + 0.1 }));
    const staying = over(third());
    const end = WORDS.find(([, , text]) => text === 'features,')[1];
    const first = Math.ceil(GROUP_START * FPS - 1e-9);
    const last = Math.floor(end * FPS);
    assert.ok(last - first > 15, 'a group of many frames');
    for (let frame = first; frame <= last; frame++) {
      const rows = captionRows(leaving, frame / FPS);
      assert.deepEqual(rows, captionRows(staying, frame / FPS), `frame ${frame}: where it began`);
      assert.ok(rows[1] < NORMAL[0], `frame ${frame}: above its normal place`);
    }
    // The next group begins after the lower third has left: back in its normal place.
    const next = WORDS.find(([, , text]) => text === 'honestly?')[0] + 0.1;
    assert.deepEqual(captionRows(leaving, next), captionRows(PLAIN, next));
    assert.notDeepEqual(captionRows(staying, next), captionRows(PLAIN, next));
    // And one that ends before the group begins moves nothing at all.
    const gone = over(third({ timelineEnd: GROUP_START - 0.5 }));
    assert.ok(pixels(gone, SAYING).equals(pixels(PLAIN, SAYING)));
  });

  it('goes by where the user put the element: its transform counts', () => {
    // Not in the way where the kit puts it; dragged under the caption, it is.
    const dragged = over(third({ transform: { x: 520 } }, SHORT));
    assert.ok(captionRows(dragged, SAYING)[1] < NORMAL[0]);
    // In the way where the kit puts it; dragged to the top of the frame, it is not.
    const away = over(third({ transform: { y: -700 } }));
    assert.deepEqual(captionRows(away, SAYING), NORMAL);
    // Made small in its corner, it no longer reaches the caption.
    const small = { scaleX: 0.5, scaleY: 0.5, anchorX: 0, anchorY: 1, x: -420, y: 240 };
    assert.deepEqual(captionRows(over(third({ transform: small })), SAYING), NORMAL);
    // Keyframes: in the way for a part of the group is in the way for all of it.
    const keys = [
      { t: GROUP_START - 0.2, v: -200 },
      { t: GROUP_START + 0.6, v: 900 },
    ];
    const travelling = over(third({ keyframes: { 'transform.x': keys } }, SHORT));
    assert.ok(captionRows(travelling, GROUP_START + 0.05)[1] < NORMAL[0], 'before it arrives');
  });

  it('moves a caption at the top below what is in its way', () => {
    const top = { preset: 'clean', position: { anchor: 'top', offset: 8 } };
    const dragged = third({ transform: { x: 620, y: -830 } }, SHORT);
    const edl = over(dragged, top);
    const [blockTop, blockBottom] = overlayRows(edl, SAYING);
    const [normalTop] = captionRows(unmoved(edl), SAYING);
    assert.ok(normalTop < blockBottom && blockTop < 0.2, 'it would be on the lower third');
    assert.ok(captionRows(edl, SAYING)[0] > blockBottom + 0.01, 'and is drawn below it');
  });

  it('does not count what is not seen, nor what fills the frame', () => {
    const edl = over(third());
    const track = (fields) => ({
      ...edl,
      tracks: edl.tracks.map((t) => (t.trackId === 'o0' ? { ...t, ...fields } : t)),
    });
    assert.deepEqual(captionRows(track({ muted: true }), SAYING), NORMAL, 'a hidden track');
    assert.deepEqual(captionRows(track({ opacity: 0 }), SAYING), NORMAL, 'a transparent track');
    const solo = {
      ...edl,
      tracks: edl.tracks.map((t) => (t.trackId === 'v1' ? { ...t, solo: true } : t)),
    };
    assert.deepEqual(captionRows(solo, SAYING), NORMAL, 'a track left out by a solo');
    const faint = over(third({ transform: { opacity: 0 } }));
    assert.deepEqual(captionRows(faint, SAYING), NORMAL, 'an element at no opacity');
    // A segment fills the frame: there is no way round it, and the caption stays.
    const intro = overlay('clean', 'intro', { title: 'Launch day', subtitle: 'A subtitle' });
    assert.ok(pixels(over(intro), SAYING).equals(pixels(unmoved(over(intro)), SAYING)));
  });

  it('can be switched off in the style', () => {
    const off = unmoved(over(third()));
    assert.deepEqual(off.captions.style, { preset: 'clean', avoid: false });
    assert.deepEqual(captionRows(off, SAYING)[1], NORMAL[1], 'drawn where it always was');
  });

  it('moves a caption by the same share of the frame on every canvas', () => {
    const edl = over(third());
    const small = captionRows(edl, SAYING, { width: 320, height: 180 });
    const large = captionRows(edl, SAYING, { width: 1280, height: 720 });
    assert.ok(Math.abs(small[0] - large[0]) < 0.02, `${small[0]} vs ${large[0]}`);
    assert.ok(Math.abs(small[1] - large[1]) < 0.02, `${small[1]} vs ${large[1]}`);
    // A tall and a square frame of the same document lay the overlay out anew.
    for (const format of ['tall', 'square']) {
      const made = spoken({ format, over: [[third()]] });
      const size = { width: made.size.width / 2, height: made.size.height / 2 };
      const [, bottom] = captionRows(made.edl, SAYING, size);
      const [, normal] = captionRows(unmoved(made.edl), SAYING, size);
      assert.ok(bottom < normal - 0.02, `${format}: moved up`);
    }
  });

  it('leaves subtitle files as they were', () => {
    const cues = timelineCues(PLAIN, () => WORDS);
    assert.ok(cues.length > 5);
    assert.deepEqual(
      timelineCues(over(third()), () => WORDS),
      cues,
    );
  });
});

describe('what the check costs', () => {
  /** Text measurements per frame of a document, over the frames of one group. */
  function measured(edl, fontReady) {
    const env = { ...createEnv({ words: () => WORDS }), ...(fontReady && { fontReady }) };
    const ctx = env.createCanvas(SIZE.width, SIZE.height).getContext('2d');
    const measure = ctx.measureText.bind(ctx);
    let count = 0;
    ctx.measureText = (text) => (count++, measure(text));
    const counts = [];
    for (
      let frame = Math.ceil(GROUP_START * FPS);
      frame < Math.ceil(GROUP_START * FPS) + 8;
      frame++
    ) {
      count = 0;
      drawFrame(ctx, edl, frame / FPS, env, frameInfo(edl, SIZE.width, SIZE.height));
      counts.push(count);
    }
    return counts;
  }

  it('measures a group once: the frames after its first measure nothing more', () => {
    const edl = over(third());
    const [on, off] = [measured(edl), measured(unmoved(edl))];
    assert.ok(on[0] > off[0], `the first frame decides (${on[0]} measurements, ${off[0]} without)`);
    assert.deepEqual(on.slice(1), off.slice(1), 'every later frame costs what it cost before');
    // A document without overlays is never measured for.
    assert.deepEqual(measured(PLAIN), measured(unmoved(PLAIN)));
  });

  it('does not keep an answer worked out before the overlay’s font arrived', () => {
    const edl = over(third());
    // Elements ask for their fonts at 72 px: those are still loading.
    const waiting = measured(edl, (font) => !font.includes(' 72px '));
    const steady = measured(unmoved(edl), (font) => !font.includes(' 72px '));
    assert.ok(
      waiting.every((count, i) => count > steady[i]),
      'worked out anew at every frame',
    );
  });
});

describe('an overlay whose picture is still loading', () => {
  it('is decided again when the picture arrives and its size is known', () => {
    // A banner as high as it is told and as wide as its picture makes it.
    const design = normalizeDesign({
      kind: 'overlay',
      layers: [{ id: 'banner', type: 'image', src: '/kit/banner.png', at: 'bottom-left', h: 14 }],
    });
    const element = { kit: { id: 'own', key: 'k' }, id: 'banner', slots: {}, design };
    const edl = over(createClip({ clipId: 'el', timelineStart: 0, timelineEnd: 20, element }));
    const off = unmoved(edl);
    let picture = null;
    const env = { ...createEnv({ words: () => WORDS }), image: () => picture };
    const drawn = (doc) => {
      const ctx = env.createCanvas(SIZE.width, SIZE.height).getContext('2d');
      drawFrame(ctx, doc, SAYING, env, frameInfo(doc, SIZE.width, SIZE.height));
      return Buffer.from(ctx.getImageData(0, 0, SIZE.width, SIZE.height).data);
    };
    // Its size unknown, the banner is taken for a square in its corner: nothing in the way.
    assert.ok(drawn(edl).equals(drawn(off)), 'while it loads');
    // It arrives, six times as wide as it is high: now it reaches under the caption.
    picture = env.createCanvas(1200, 200);
    assert.ok(!drawn(edl).equals(drawn(off)), 'the same document, decided anew');
    assert.ok(drawn(edl).equals(drawn(edl)), 'and then kept');
  });
});

describe('the reference documents of this rule', () => {
  it('each show what their name says', () => {
    const still = ['after', 'off'];
    for (const [name, [{ edl, size }, time]] of Object.entries(roomDocs())) {
      const small = { width: size.width / 2, height: size.height / 2 };
      const same = pixels(edl, time, small).equals(pixels(unmoved(edl), time, small));
      assert.equal(same, still.includes(name), `${name}: ${same ? 'not moved' : 'moved'}`);
    }
  });
});
