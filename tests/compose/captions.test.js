/**
 * The caption pass of the frame compositor, on the server canvas: when a
 * caption is drawn and when it is not, what a host is asked for, and that
 * cutting a clip changes no pixel.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, renderFrame } from '../../src/api/compose/index.js';
import { captionFont } from '../../src/utils/captions/index.js';
import { frameInfo, requirements } from '../../src/utils/compose/index.js';
import { drawFrame } from '../../src/utils/compose/drawFrame.js';
import { createClip, createEdl, createTrack } from '../../src/utils/edl/factory.js';
import { setCaptionWords, setCaptions, splitClips } from '../../src/utils/edl/index.js';
import { WORDS } from '../captions/scenes.js';

const TALK = '/media/talk.mp4';
const SIZE = { width: 480, height: 270 };
const FPS = 30;

/** A grey backdrop, and the talk's sound on an audio track with captions on. */
function spoken(sound = {}, extra = {}) {
  const span = { timelineStart: 0, timelineEnd: 20 };
  const bg = createClip({
    clipId: 'bg',
    ...span,
    generator: { type: 'solid', seed: 0, params: { color: '#4b5563' } },
  });
  const voice = createClip({
    clipId: 'vo',
    sourceFile: TALK,
    ...span,
    captions: { on: true },
    ...sound,
  });
  return createEdl({
    fps: FPS,
    tracks: [
      createTrack('video', { trackId: 'v1', clips: [bg] }),
      createTrack('audio', { trackId: 'a1', clips: [voice] }),
    ],
    ...extra,
  });
}

const pixels = (edl, time, options = {}) => {
  const canvas = renderFrame(edl, time, { ...SIZE, words: () => WORDS, ...options });
  return Buffer.from(canvas.getContext('2d').getImageData(0, 0, SIZE.width, SIZE.height).data);
};
/** The frame with no caption on it. */
const BARE = pixels(spoken({ captions: undefined }), 1);
const captioned = (edl, time, options) => !pixels(edl, time, options).equals(BARE);
const said = WORDS.find(([, , text]) => text === 'features,');

describe('the caption pass', () => {
  it('draws the captions of a clip that is heard, over the picture', () => {
    assert.equal(captioned(spoken(), said[0] + 0.1), true);
    assert.equal(captioned(spoken({ captions: { on: false } }), said[0] + 0.1), false);
    assert.equal(captioned(spoken({ captions: undefined }), said[0] + 0.1), false);
  });

  it('shows a caption from the frame its first word starts on', () => {
    // The first word starts at 0.4 s: frame 12 at 30 fps.
    const first = WORDS[0][0];
    const frame = Math.ceil(first * FPS - 1e-9);
    assert.equal(frame, 12);
    assert.equal(captioned(spoken(), (frame - 1) / FPS), false, 'the frame before');
    assert.equal(captioned(spoken(), frame / FPS), true, 'the frame of the word');
    // A word that starts between two frames is on screen from the later one.
    const between = spoken({ captions: { on: true, words: [[1.01, 1.5, 'now']] } });
    assert.equal(captioned(between, 30 / FPS), false);
    assert.equal(captioned(between, 31 / FPS), true);
    // And the clip's own place on the timeline moves it frame for frame.
    const moved = spoken({ timelineStart: 2, timelineEnd: 22 });
    assert.equal(captioned(moved, (frame + 59) / FPS), false);
    assert.equal(captioned(moved, (frame + 60) / FPS), true);
  });

  it('draws nothing for a muted voice, or one that is not the solo', () => {
    const edl = spoken();
    const withAudio = (fields) => ({
      ...edl,
      tracks: [edl.tracks[0], { ...edl.tracks[1], ...fields }],
    });
    assert.equal(captioned(withAudio({ muted: true }), said[0] + 0.1), false);
    const other = createTrack('audio', { trackId: 'a2', solo: true });
    const soloed = { ...edl, tracks: [...edl.tracks, other] };
    assert.equal(captioned(soloed, said[0] + 0.1), false);
  });

  it('waits for words and for the font, and draws when they are there', () => {
    const edl = spoken();
    const time = said[0] + 0.1;
    assert.equal(captioned(edl, time, { words: () => null }), false, 'words still loading');
    assert.equal(captioned(edl, time, { words: undefined }), false, 'a host without words');
    const asked = [];
    const env = {
      ...createEnv({ words: () => WORDS }),
      fontReady: (font, text) => (asked.push([font, text]), false),
    };
    assert.equal(captioned(edl, time, { env }), false, 'font not ready');
    assert.deepEqual(asked, [[captionFont(undefined, frameInfo(edl, 480, 270)), '37 features,']]);
  });

  it('takes a sidecar, its word list or triples from the host', () => {
    const time = said[0] + 0.1;
    const reference = pixels(spoken(), time);
    const list = WORDS.map(([start, end, word]) => ({ word: ` ${word}`, start, end }));
    assert.ok(pixels(spoken(), time, { words: () => list }).equals(reference));
    const sidecar = { transcript: list, segments: [], language: 'en' };
    assert.ok(pixels(spoken(), time, { words: () => sidecar }).equals(reference));
  });

  it('asks the host only for clips without words of their own', () => {
    const asked = [];
    const words = (clip) => (asked.push(clip.clipId), WORDS);
    pixels(spoken(), 1, { words });
    assert.deepEqual(asked, ['vo']);
    const own = setCaptionWords(spoken(), 'vo', [[0.5, 3, 'mine']]);
    asked.length = 0;
    assert.equal(captioned(own, 1, { words }), true);
    assert.deepEqual(asked, []);
  });

  it('survives a host or a style that misbehaves', () => {
    const odd = spoken({}, { captions: { style: { preset: 'pop', size: 'huge', font: 7 } } });
    assert.equal(captioned(odd, said[0] + 0.1), true);
    const junk = () => ({ transcript: 'no', segments: 4 });
    assert.equal(captioned(spoken(), said[0] + 0.1, { words: junk }), false);
  });
});

describe('a split clip', () => {
  it('shows the same pixels as the whole clip, at every frame around the cut', () => {
    const whole = spoken();
    // In the middle of "features," — and in the middle of its group.
    const cut = Math.round((said[0] + 0.2) * FPS) / FPS;
    const halves = splitClips(whole, cut);
    assert.equal(halves.tracks[1].clips.length, 2);
    for (let frame = Math.round(cut * FPS) - 6; frame <= Math.round(cut * FPS) + 6; frame++) {
      const time = frame / FPS;
      assert.ok(pixels(halves, time).equals(pixels(whole, time)), `frame ${frame}`);
    }
  });

  it('shows the same pixels for a linked pair cut together, captions set on the picture', () => {
    const pair = spoken({ linkedClipId: 'pic', captions: undefined });
    const picture = createClip({
      clipId: 'pic',
      sourceFile: TALK,
      timelineStart: 0,
      timelineEnd: 20,
      linkedClipId: 'vo',
    });
    const tracks = [createTrack('video', { trackId: 'v0', clips: [picture] }), ...pair.tracks];
    const on = setCaptions({ ...pair, tracks }, 'pic');
    const cut = Math.round((said[0] + 0.2) * FPS) / FPS;
    const halves = splitClips(on, cut);
    assert.equal(halves.tracks[0].clips.length, 2);
    for (const time of [cut - 1 / FPS, cut, cut + 1 / FPS, cut + 0.5]) {
      assert.ok(pixels(halves, time).equals(pixels(on, time)), `at ${time}`);
    }
  });
});

describe('requirements of a captioned document', () => {
  it('names the files whose words are needed and the caption font', () => {
    const edl = spoken();
    const needs = requirements(edl);
    assert.deepEqual(needs.words, [TALK]);
    assert.equal(needs.fonts.length, 1);
    assert.match(needs.fonts[0].font, /^700 [\d.]+px "Inter"/);
    assert.equal(needs.fonts[0].text, 'Aa0', 'a few plain letters until the words are known');
    const known = requirements(edl, () => WORDS);
    assert.ok(known.fonts[0].text.includes('🎉'), 'every character the words will draw');
    assert.deepEqual(requirements(spoken({ captions: undefined })).words, []);
    assert.deepEqual(requirements(spoken({ captions: undefined })).fonts, []);
  });

  it('asks for no file when the clip carries its words, and follows the style’s font', () => {
    const own = setCaptionWords(spoken(), 'vo', [[0.5, 3, 'Über']]);
    const styled = {
      ...own,
      captions: { style: { preset: 'clean', font: { family: 'Bebas Neue' } } },
    };
    const needs = requirements(styled);
    assert.deepEqual(needs.words, []);
    assert.match(needs.fonts[0].font, /"Bebas Neue"/);
    assert.ok(needs.fonts[0].text.includes('Ü'));
  });

  it('draws on any canvas: the caption keeps its place in the frame', () => {
    const edl = spoken();
    const time = said[0] + 0.3;
    /** Rows of a frame that the caption touches, as fractions of its height. */
    const rows = (width, height) => {
      const draw = (doc) => {
        const env = createEnv({ words: () => WORDS });
        const canvas = env.createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        drawFrame(ctx, doc, time, env, frameInfo(doc, width, height));
        return ctx.getImageData(0, 0, width, height).data;
      };
      const [a, b] = [draw(edl), draw(spoken({ captions: undefined }))];
      let top = height;
      let bottom = 0;
      for (let y = 0; y < height; y++) {
        for (let i = y * width * 4; i < (y + 1) * width * 4; i++) {
          if (a[i] === b[i]) continue;
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          break;
        }
      }
      return [top / height, bottom / height];
    };
    const [smallTop, smallBottom] = rows(320, 180);
    const [largeTop, largeBottom] = rows(1280, 720);
    assert.ok(Math.abs(smallTop - largeTop) < 0.02, `${smallTop} vs ${largeTop}`);
    assert.ok(Math.abs(smallBottom - largeBottom) < 0.02, `${smallBottom} vs ${largeBottom}`);
    assert.ok(largeTop > 0.75 && largeBottom < 0.95, 'near the bottom, inside the frame');
  });
});
