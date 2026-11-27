import { fixture, expect, waitUntil } from '@open-wc/testing';
import { createEdl, createTrack } from '#utils/edl/factory.js';
import { deepFreeze } from '#utils/edl/testkit.js';
import * as session from '#utils/editor/session.js';
import './track-header.js';

const track = (id) => session.getDoc().tracks.find((t) => t.trackId === id);
const button = (el, label) => el.querySelector(`button[aria-label="${label}"]`);

async function mount(trackId) {
  const doc = createEdl({
    tracks: [
      createTrack('video', { trackId: 'v1', name: 'Main' }),
      createTrack('audio', { trackId: 'a1', name: 'Music', volume: 0.5 }),
    ],
  });
  session.loadDoc(deepFreeze(doc)); // the header renders the session's own document
  const el = await fixture(`<track-header track-id="${trackId}"></track-header>`);
  await waitUntil(() => el.querySelector('.track-header-name'), 'never rendered');
  return el;
}

describe('track-header', () => {
  it('shows the name and labelled mute / solo / lock / options buttons', async () => {
    const el = await mount('a1');
    expect(el.querySelector('.track-header-name').value).to.equal('Music');
    for (const label of ['Mute', 'Solo', 'Lock', 'Track options']) {
      expect(button(el, label), label).to.exist;
      expect(button(el, label).getAttribute('type')).to.equal('button');
    }
    expect(button(el, 'Mute').getAttribute('aria-pressed')).to.equal('false');
  });

  it('calls mute "Hide" on a video track and has no volume slider there', async () => {
    const video = await mount('v1');
    expect(button(video, 'Hide')).to.exist;
    expect(video.querySelector('track-volume')).to.equal(null);
    const audio = await mount('a1');
    expect(audio.querySelector('track-volume input').value).to.equal('0.5');
  });

  it('toggles mute, solo and lock in the document, each as one undo step', async () => {
    const el = await mount('a1');
    button(el, 'Mute').click();
    button(el, 'Solo').click();
    button(el, 'Lock').click();
    expect([track('a1').muted, track('a1').solo, track('a1').locked]).to.deep.equal([
      true,
      true,
      true,
    ]);
    await waitUntil(() => button(el, 'Lock').getAttribute('aria-pressed') === 'true');
    expect(button(el, 'Lock').querySelector('app-icon').name).to.equal('lock');
    session.undo();
    expect(track('a1').locked).to.equal(false);
    expect(track('a1').solo).to.equal(true);
  });

  it('renames in place; an empty name is refused', async () => {
    const el = await mount('v1');
    const input = el.querySelector('.track-header-name');
    input.value = 'A-roll';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(track('v1').name).to.equal('A-roll');
    input.value = '   ';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(track('v1').name).to.equal('A-roll');
    expect(input.value).to.equal('A-roll');
  });

  it('previews the volume while the slider moves and records one undo step', async () => {
    const el = await mount('a1');
    const slider = el.querySelector('track-volume input');
    for (const value of ['0.8', '1.2', '1.6']) {
      slider.value = value;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      expect(track('a1').volume).to.equal(Number(value));
    }
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    session.undo();
    expect(track('a1').volume).to.equal(0.5);
    expect(session.canUndo()).to.equal(false);
  });

  it('asks its owner for the options menu', async () => {
    const el = await mount('v1');
    let asked = null;
    el.parentElement.addEventListener('trackmenu', (event) => (asked = event.detail), {
      once: true,
    });
    button(el, 'Track options').click();
    expect(asked.trackId).to.equal('v1');
    expect(asked.x).to.be.a('number');
  });
});
