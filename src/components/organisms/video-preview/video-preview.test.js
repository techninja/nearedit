import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import ViewState from '#store/ViewState.js';
import { createClip, createTrack } from '#utils/edl/factory.js';
import * as transport from '#utils/playback/transport.js';
import { previewSurface } from './video-preview.js';

const GREEN = '#00ff00';
const RED = '#ff0000';

/** A title whose text and box share one colour: a solid block mid-frame. */
const block = (clipId, color, timelineStart, timelineEnd, extra = {}) =>
  createClip({
    clipId,
    timelineStart,
    timelineEnd,
    text: { content: 'MMMM', fontSize: 300, color, background: color },
    ...extra,
  });

const doc = (tracks, resolution = '1280x720') => ({
  version: 2,
  fps: 30,
  resolution,
  tracks,
  markers: [],
});

/** Centre pixel of the preview canvas as [r, g, b]. */
function centre(el) {
  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data;
  return [data[0], data[1], data[2]];
}
const isColor = (el, [r, g, b]) => {
  const [pr, pg, pb] = centre(el);
  return Math.abs(pr - r) < 30 && Math.abs(pg - g) < 30 && Math.abs(pb - b) < 30;
};

/** Load the component's real stylesheet (the test page has no app shell). */
function loadStyles() {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./video-preview.css', import.meta.url).href;
    link.onload = resolve;
    link.onerror = reject;
    document.head.append(link);
  });
}

async function mount(tracks, resolution) {
  transport.stop();
  await store.set(TimelineState, doc(tracks, resolution));
  await store.set(ViewState, {
    playheadPosition: 0,
    cursorPosition: 0,
    playing: false,
    loopEnabled: false,
  });
  const stage = await fixture(
    '<div style="display:flex;width:320px;height:180px"><video-preview></video-preview></div>',
  );
  const el = stage.querySelector('video-preview');
  await waitUntil(() => previewSurface(el), 'surface was not created');
  return el;
}

describe('video-preview', () => {
  before(loadStyles);
  afterEach(() => transport.stop());

  it('renders a labelled canvas and the playhead timecode', async () => {
    const el = await mount([createTrack('video', { clips: [block('a', GREEN, 0, 4)] })]);
    const canvas = el.querySelector('canvas');
    expect(canvas).to.exist;
    expect(canvas.getAttribute('aria-label')).to.equal('Program preview');
    expect(el.querySelector('.preview-timecode').textContent.trim()).to.equal('00:00:00:00');
    transport.seek(1.5);
    await waitUntil(
      () => el.querySelector('.preview-timecode').textContent.trim() === '00:00:01:15',
    );
  });

  it('sizes the canvas to its container at the adaptation aspect ratio', async () => {
    const el = await mount([createTrack('video', { clips: [block('a', GREEN, 0, 4)] })]);
    const canvas = el.querySelector('canvas');
    await waitUntil(() => canvas.style.width === '320px', 'canvas never fitted the container');
    expect(canvas.style.height).to.equal('180px');
    expect(canvas.width / canvas.height).to.be.closeTo(16 / 9, 0.02);
    await store.set(TimelineState, { resolution: '1080x1920' });
    await waitUntil(
      () => canvas.style.height === '180px' && canvas.style.width === '101px',
      'not refitted to 9:16',
    );
    expect(canvas.width / canvas.height).to.be.closeTo(9 / 16, 0.02);
  });

  it('draws the frame at the playhead and follows it while paused (scrub)', async () => {
    const el = await mount([
      createTrack('video', { clips: [block('a', GREEN, 0, 2), block('b', RED, 2, 4)] }),
    ]);
    await waitUntil(() => isColor(el, [0, 255, 0]), 'first clip not drawn');
    transport.seek(3);
    await waitUntil(() => isColor(el, [255, 0, 0]), 'second clip not drawn after seek');
    transport.seek(5);
    await waitUntil(() => isColor(el, [0, 0, 0]), 'gap is not black');
  });

  it('puts the first video track in front and honours mute', async () => {
    const tracks = [
      createTrack('video', { trackId: 'v1', clips: [block('front', GREEN, 0, 4)] }),
      createTrack('video', { trackId: 'v2', clips: [block('back', RED, 0, 4)] }),
    ];
    const el = await mount(tracks);
    await waitUntil(() => isColor(el, [0, 255, 0]), 'front track is not on top');
    await store.set(TimelineState, { tracks: [{ ...tracks[0], muted: true }, tracks[1]] });
    await waitUntil(
      () => isColor(el, [255, 0, 0]),
      'muting the front track did not reveal the back',
    );
  });

  it('repaints when the document is edited while paused', async () => {
    const el = await mount([
      createTrack('video', { trackId: 'v1', clips: [block('a', GREEN, 0, 4)] }),
    ]);
    await waitUntil(() => isColor(el, [0, 255, 0]));
    await store.set(TimelineState, {
      tracks: [createTrack('video', { trackId: 'v1', clips: [block('a', RED, 0, 4)] })],
    });
    await waitUntil(() => isColor(el, [255, 0, 0]), 'edit was not repainted');
  });

  it('halves a fading clip at the midpoint of its fade', async () => {
    const el = await mount([
      createTrack('video', { clips: [block('a', GREEN, 0, 2, { fadeOut: 1 })] }),
    ]);
    transport.seek(1.5);
    await waitUntil(() => isColor(el, [0, 128, 0]), `fade midpoint was ${centre(el)}`);
  });

  it('shows frames from the transport while playing and stops at the end', async () => {
    const el = await mount([
      createTrack('video', { clips: [block('a', GREEN, 0, 0.4), block('b', RED, 0.4, 0.8)] }),
    ]);
    await waitUntil(() => isColor(el, [0, 255, 0]));
    expect(transport.play()).to.equal(true);
    await waitUntil(() => isColor(el, [255, 0, 0]), 'second clip never shown during playback', {
      timeout: 3000,
    });
    await waitUntil(() => !transport.isPlaying(), 'playback did not stop at the end', {
      timeout: 3000,
    });
    await waitUntil(
      () => store.get(ViewState).playheadPosition === 0.8 && !store.get(ViewState).playing,
    );
    await waitUntil(() => isColor(el, [0, 0, 0]), 'end of timeline is not black');
  });

  it('stops playback and releases its surface when disconnected', async () => {
    const el = await mount([createTrack('video', { clips: [block('a', GREEN, 0, 5)] })]);
    transport.play();
    await waitUntil(() => store.get(ViewState).playheadPosition > 0.1, 'never started', {
      timeout: 3000,
    });
    el.remove();
    await waitUntil(() => !previewSurface(el), 'surface still held after disconnect');
    expect(transport.isPlaying()).to.equal(false);
  });
});
