import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { checkEngine, clipNeeds, documentNeeds, engineChoice, trackNeeds } from './route.js';
import { planSegments, renderSegments } from './segments.js';
import { createTiming, snapTrack } from './timing.js';

const footage = (start, end, more = {}) =>
  createClip({ sourceFile: '/m/a.mp4', timelineStart: start, timelineEnd: end, ...more });
const title = (start, end, more = {}) =>
  createClip({ timelineStart: start, timelineEnd: end, text: { content: 'Hi' }, ...more });
const generator = (start, end) =>
  createClip({ timelineStart: start, timelineEnd: end, generator: { type: 'solid' } });
const video = (clips, more = {}) => createTrack('video', { clips, ...more });
const needs = (clip, track = video([clip])) => clipNeeds(clip, track);

describe('render routing: what needs the compositor', () => {
  it('sends plain footage and stills down the filter graph', () => {
    assert.deepEqual(needs(footage(0, 2)), []);
    assert.deepEqual(needs(createClip({ sourceFile: '/m/p.jpg', timelineEnd: 2 })), []);
    const moved = { x: 40, rotation: 12, opacity: 0.5, kenBurns: { enabled: true, endScale: 2 } };
    assert.deepEqual(needs(footage(0, 2, { fadeIn: 1, fadeOut: 1, transform: moved })), []);
    assert.deepEqual(needs(footage(0, 2, { keyframes: { volume: [{ t: 0, v: 1 }] } })), []);
    assert.deepEqual(needs(footage(0, 2, { fadeInCurve: 'smooth' })), [], 'a curve without a fade');
    const off = [{ effectId: 'fx', type: 'blur', enabled: false }];
    assert.deepEqual(needs(footage(0, 2, { effects: off })), [], 'a disabled effect');
    assert.deepEqual(needs(createClip({ timelineEnd: 2, placeholder: true })), []);
    assert.deepEqual(trackNeeds(video([])), []);
    assert.deepEqual(documentNeeds(createEdl()), []);
    assert.deepEqual(documentNeeds({ background: 'nonsense' }), [], 'unreadable means black');
  });

  it('names each thing that only the compositor can draw', () => {
    assert.deepEqual(needs(generator(0, 2)), ['generator']);
    assert.deepEqual(needs(title(0, 2)), ['title']);
    const blur = [{ effectId: 'fx', type: 'blur', enabled: true, params: {} }];
    assert.deepEqual(needs(footage(0, 2, { effects: blur })), ['effect']);
    assert.deepEqual(needs(footage(0, 2, { blendMode: 'screen' })), ['blend']);
    const keys = {
      'transform.x': [
        { t: 0, v: 0 },
        { t: 1, v: 90 },
      ],
    };
    assert.deepEqual(needs(footage(0, 2, { keyframes: keys })), ['keyframes']);
    assert.deepEqual(needs(footage(0, 2, { fadeIn: 1, fadeInCurve: 'smooth' })), ['fade-curve']);
    assert.deepEqual(needs(footage(0, 2, { fadeOut: 1, fadeOutCurve: 'sharp' })), ['fade-curve']);
    assert.deepEqual(needs(title(0, 2, { blendMode: 'add', fadeIn: 1, fadeInCurve: 'slow' })), [
      'title',
      'blend',
      'fade-curve',
    ]);
    assert.deepEqual(trackNeeds(video([], { opacity: 0.5 })), ['track-opacity']);
    assert.deepEqual(trackNeeds(video([], { blendMode: 'multiply', effects: blur })), [
      'track-effect',
      'track-blend',
    ]);
    assert.deepEqual(documentNeeds({ background: '#000001' }), ['background']);
    assert.deepEqual(documentNeeds(createEdl(), 'canvas'), ['forced']);
  });

  it('ignores the curve of a fade-out that a cross-fade hides', () => {
    const out = footage(0, 2, { fadeOut: 1, fadeOutCurve: 'fast' });
    const into = footage(1, 3, { fadeIn: 1 });
    assert.deepEqual(clipNeeds(out, video([out, into])), [], 'the incoming clip does the dissolve');
    const curved = { ...into, fadeInCurve: 'fast' };
    assert.deepEqual(clipNeeds(curved, video([out, curved])), ['fade-curve']);
  });

  it('reads RENDER_ENGINE and refuses what the filter graph cannot do', () => {
    assert.equal(engineChoice({}), 'auto');
    assert.equal(engineChoice({ RENDER_ENGINE: ' Canvas ' }), 'canvas');
    assert.equal(engineChoice({ RENDER_ENGINE: 'ffmpeg' }), 'ffmpeg');
    assert.throws(() => engineChoice({ RENDER_ENGINE: 'gpu' }), /must be auto, canvas or ffmpeg/);
    assert.doesNotThrow(() => checkEngine([], 'ffmpeg'));
    assert.doesNotThrow(() => checkEngine(['title'], 'auto'));
    assert.throws(
      () => checkEngine(['title', 'effect', 'title'], 'ffmpeg'),
      (err) =>
        err.status === 422 &&
        /RENDER_ENGINE=ffmpeg cannot render this timeline: it has a title, an effect on a clip\./.test(
          err.message,
        ),
    );
  });
});

describe('render routing: segments', () => {
  const plan = (tracks, limits = {}, range = null) => {
    const edl = createEdl({ tracks: [...tracks, createTrack('audio')] });
    const timing = createTiming(edl, range);
    const snapped = edl.tracks.map((track) => snapTrack(track, timing));
    // Chunking has a test of its own: elsewhere a segment stays whole.
    const all = { chunkFrames: 1000, ...limits };
    return planSegments(snapped, timing, all).map((s) => [s.start, s.end, s.engine]);
  };

  it('keeps plain footage on the filter graph around a title', () => {
    const tracks = [video([title(3, 6)]), video([footage(0, 10)])];
    assert.deepEqual(plan(tracks), [
      [0, 90, 'ffmpeg'],
      [90, 180, 'canvas'],
      [180, 300, 'ffmpeg'],
    ]);
    const segments = renderSegments(createEdl({ tracks: [...tracks, createTrack('audio')] }));
    assert.deepEqual(
      segments.map((s) => s.reasons),
      [[], ['title'], []],
    );
    assert.deepEqual(segments[1], {
      start: 3,
      end: 6,
      frames: 90,
      engine: 'canvas',
      reasons: ['title'],
    });
  });

  it('lets a short compositor stretch borrow only the frames it lacks', () => {
    // A 10-frame title: it takes 20 frames of the footage after it, not all of it.
    const flash = [video([title(3, 3 + 10 / 30)]), video([footage(0, 10)])];
    assert.deepEqual(plan(flash), [
      [0, 90, 'ffmpeg'],
      [90, 120, 'canvas'],
      [120, 300, 'ffmpeg'],
    ]);
    // At the very end it borrows from the footage before it.
    const outro = [video([title(10 - 10 / 30, 10)]), video([footage(0, 10)])];
    assert.deepEqual(plan(outro), [
      [0, 270, 'ffmpeg'],
      [270, 300, 'canvas'],
    ]);
    // Plain footage too short to stand alone joins the compositor stretch.
    const gap = [video([title(0, 3), title(3.5, 6)]), video([footage(0, 6)])];
    assert.deepEqual(plan(gap), [[0, 180, 'canvas']]);
    const short = [video([title(0, 0.5)]), video([footage(0, 1.2)])];
    assert.deepEqual(plan(short), [[0, 36, 'canvas']], 'nothing left to stand alone');
  });

  it('draws the whole range when the document or the track needs it', () => {
    const clips = [footage(0, 4), footage(4, 8)];
    assert.deepEqual(plan([video(clips, { opacity: 0.5 })]), [[0, 240, 'canvas']]);
    assert.deepEqual(plan([video(clips)], { everywhere: ['background'] }), [[0, 240, 'canvas']]);
    const dim = [video([footage(2, 4)], { blendMode: 'screen' }), video([footage(0, 8)])];
    assert.deepEqual(plan(dim), [
      [0, 60, 'ffmpeg'],
      [60, 120, 'canvas'],
      [120, 240, 'ffmpeg'],
    ]);
  });

  it('cuts long compositor segments into chunks on the keyframe grid', () => {
    const tracks = [video([generator(0, 10)])];
    const byDefault = { chunkFrames: 0 };
    assert.deepEqual(plan(tracks, byDefault), [
      [0, 120, 'canvas'],
      [120, 240, 'canvas'],
      [240, 300, 'canvas'],
    ]);
    assert.deepEqual(plan(tracks, { chunkFrames: 150 }), [
      [0, 150, 'canvas'],
      [150, 300, 'canvas'],
    ]);
    // A remainder too short to stand alone joins the chunk before it.
    assert.deepEqual(plan([video([generator(0, 8.5)])], byDefault), [
      [0, 120, 'canvas'],
      [120, 255, 'canvas'],
    ]);
    assert.deepEqual(
      plan([video([footage(0, 25)])]),
      [[0, 750, 'ffmpeg']],
      'footage is not chunked',
    );
    assert.deepEqual(plan(tracks, byDefault, { start: 1, end: 12 }), [
      [30, 150, 'canvas'],
      [150, 270, 'canvas'],
      [270, 300, 'canvas'],
    ]);
  });

  it('applies RENDER_ENGINE to the plan', () => {
    const edl = createEdl({
      tracks: [video([title(3, 6)]), video([footage(0, 10)]), createTrack('audio')],
    });
    const forced = renderSegments(edl, { engine: 'canvas' });
    assert.deepEqual(
      forced.map((s) => [s.start, s.end, s.engine]),
      [
        [0, 4, 'canvas'],
        [4, 8, 'canvas'],
        [8, 10, 'canvas'],
      ],
    );
    assert.deepEqual(forced[0].reasons, ['forced', 'title']);
    assert.throws(
      () => renderSegments(edl, { engine: 'ffmpeg' }),
      /RENDER_ENGINE=ffmpeg cannot render/,
    );
    const before = renderSegments(edl, { engine: 'ffmpeg', range: { start: 0, end: 2 } });
    assert.deepEqual(
      before.map((s) => s.engine),
      ['ffmpeg'],
      'a range without the title is fine',
    );
    const plain = createEdl({ tracks: [video([footage(0, 10)]), createTrack('audio')] });
    assert.equal(renderSegments(plain, { engine: 'ffmpeg' })[0].engine, 'ffmpeg');
    const colored = { ...plain, background: '#203040' };
    assert.deepEqual(renderSegments(colored)[0].reasons, ['background']);
  });
});
