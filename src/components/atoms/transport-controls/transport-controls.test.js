import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { createClip } from '#utils/edl/factory.js';
import { trimClipEnd } from '#utils/edl/index.js';
import { deepFreeze, testEdl } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import * as transport from '#utils/playback/transport.js';
import './transport-controls.js';

const title = (timelineStart, timelineEnd) =>
  createClip({ clipId: 'title', timelineStart, timelineEnd, text: { content: 'Title' } });
const view = () => store.get(ViewState);
const button = (el, label) => el.querySelector(`button[aria-label="${label}"]`);
const readout = (el) => el.querySelector('.transport-time').textContent.replace(/\s+/g, ' ').trim();

async function mount(duration = 10) {
  transport.stop();
  session.loadDoc(deepFreeze(testEdl({ v1: [title(0, duration)] }, { resolution: '1280x720' })));
  await store.set(ViewState, {
    playheadPosition: 0,
    cursorPosition: 0,
    playing: false,
    loopEnabled: false,
    loopStart: 0,
    loopEnd: 0,
  });
  const el = await fixture('<transport-controls></transport-controls>');
  await waitUntil(() => el.querySelector('button'), 'never rendered');
  return el;
}

describe('transport-controls', () => {
  afterEach(() => transport.stop());

  it('renders a labelled toolbar of buttons, each with an icon', async () => {
    const el = await mount();
    const toolbar = el.querySelector('[role="toolbar"]');
    expect(toolbar.getAttribute('aria-label')).to.equal('Transport');
    const labels = [...el.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(labels).to.deep.equal([
      'Go to start',
      'Previous frame',
      'Play',
      'Stop',
      'Next frame',
      'Go to end',
      'Loop playback',
    ]);
    for (const b of el.querySelectorAll('button')) {
      expect(b.getAttribute('type')).to.equal('button');
      expect(b.getAttribute('title')).to.be.a('string').and.not.empty;
      expect(b.querySelector('app-icon')).to.exist;
    }
  });

  it('shows the playhead and the duration as HH:MM:SS:FF', async () => {
    const el = await mount(75.5);
    expect(readout(el)).to.equal('00:00:00:00 / 00:01:15:15');
    transport.seek(12.5);
    await waitUntil(
      () => readout(el) === '00:00:12:15 / 00:01:15:15',
      `readout was ${readout(el)}`,
    );
    expect(el.querySelector('.transport-timecode').getAttribute('role')).to.equal('timer');
  });

  it('follows the duration and the frame rate of the document as it is edited', async () => {
    const el = await mount(10);
    expect(readout(el)).to.equal('00:00:00:00 / 00:00:10:00');
    session.edit((doc) => trimClipEnd(doc, 'title', 4.5));
    expect(transport.getDuration()).to.equal(4.5); // the transport reads the session, at once
    await waitUntil(
      () => readout(el) === '00:00:00:00 / 00:00:04:15',
      `readout was ${readout(el)}`,
    );
    session.edit((doc) => ({ ...doc, fps: 24 }));
    await waitUntil(
      () => readout(el) === '00:00:00:00 / 00:00:04:12',
      `readout was ${readout(el)}`,
    );
    session.undo();
    session.undo();
    await waitUntil(
      () => readout(el) === '00:00:00:00 / 00:00:10:00',
      `readout was ${readout(el)}`,
    );
  });

  it('plays and pauses in place with the play button', async () => {
    const el = await mount();
    transport.seek(2);
    button(el, 'Play').click();
    await waitUntil(() => view().playing && button(el, 'Pause'), 'did not start');
    expect(button(el, 'Play')).to.equal(null);
    expect(button(el, 'Pause').querySelector('app-icon').name).to.equal('pause');
    await waitUntil(() => view().playheadPosition > 2.3, 'playhead did not advance', {
      timeout: 3000,
    });
    button(el, 'Pause').click();
    await waitUntil(() => !view().playing && button(el, 'Play'), 'did not pause');
    const paused = view().playheadPosition;
    expect(paused).to.be.greaterThan(2.2);
    expect(Math.abs(paused * 30 - Math.round(paused * 30))).to.be.below(1e-6); // on a frame
    expect(view().cursorPosition).to.equal(view().playheadPosition);
    expect(button(el, 'Play').querySelector('app-icon').name).to.equal('play');
  });

  it('returns to the edit cursor with the stop button', async () => {
    const el = await mount();
    transport.seek(3);
    button(el, 'Play').click();
    await waitUntil(() => view().playheadPosition > 3.2, 'playhead did not advance', {
      timeout: 3000,
    });
    button(el, 'Stop').click();
    await waitUntil(
      () => !view().playing && view().playheadPosition === 3,
      'did not return to the cursor',
    );
  });

  it('jumps to the start and the end', async () => {
    const el = await mount(8);
    button(el, 'Go to end').click();
    await waitUntil(() => view().playheadPosition === 8);
    expect(view().cursorPosition).to.equal(8);
    button(el, 'Go to start').click();
    await waitUntil(() => view().playheadPosition === 0);
  });

  it('steps one frame at a time', async () => {
    const el = await mount();
    transport.seek(1);
    button(el, 'Next frame').click();
    await waitUntil(
      () => Math.abs(view().playheadPosition - 31 / 30) < 1e-9,
      'did not step forward',
    );
    button(el, 'Previous frame').click();
    button(el, 'Previous frame').click();
    await waitUntil(() => Math.abs(view().playheadPosition - 29 / 30) < 1e-9, 'did not step back');
    expect(readout(el).startsWith('00:00:00:29')).to.equal(true);
  });

  it('toggles looping and reflects it as a pressed button', async () => {
    const el = await mount();
    const loop = button(el, 'Loop playback');
    expect(loop.getAttribute('aria-pressed')).to.equal('false');
    loop.click();
    await waitUntil(() => loop.getAttribute('aria-pressed') === 'true');
    expect(view().loopEnabled).to.equal(true);
    loop.click();
    await waitUntil(() => loop.getAttribute('aria-pressed') === 'false');
    expect(view().loopEnabled).to.equal(false);
  });

  it('loops playback when looping is on', async () => {
    const el = await mount(0.5);
    button(el, 'Loop playback').click();
    await waitUntil(() => view().loopEnabled);
    button(el, 'Play').click();
    const seen = [];
    await waitUntil(
      () => {
        seen.push(view().playheadPosition);
        return seen.some((p, i) => i > 0 && p < seen[i - 1] - 0.1);
      },
      'never wrapped back to the start',
      { timeout: 4000, interval: 20 },
    );
    expect(view().playing).to.equal(true);
  });

  it('follows playback started elsewhere (keyboard, timeline)', async () => {
    const el = await mount();
    transport.toggle();
    await waitUntil(() => button(el, 'Pause'), 'button did not follow the transport');
    transport.toggle();
    await waitUntil(() => button(el, 'Play'));
    expect(view().playheadPosition).to.equal(0);
  });
});
