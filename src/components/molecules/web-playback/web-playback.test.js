import { fixture, expect, oneEvent } from '@open-wc/testing';
import { settle } from '#utils/ui/testing/mockApi.js';
import './web-playback.js';

async function mount(props = {}) {
  const el = await fixture(`<web-playback></web-playback>`);
  Object.assign(el, { src: '/api/media/file?path=%2Fp%2Fa.mp4', ...props });
  await settle();
  return el;
}

describe('web-playback', () => {
  it('is a plain, silent video of the recording with a play button', async () => {
    const el = await mount();
    const video = el.querySelector('video');
    expect(video.getAttribute('src')).to.equal('/api/media/file?path=%2Fp%2Fa.mp4');
    expect(video.muted).to.equal(true);
    expect(video.controls).to.equal(false);
    expect(el.querySelector('.icon-btn').getAttribute('aria-label')).to.equal('Play the recording');
    expect(el.querySelector('.web-playback-time').textContent).to.equal('0:00.0 / 0:00.0');
    expect(el.querySelector('.badge')).to.equal(null);
  });

  it('jumps where it is told to and reports where it is', async () => {
    const el = await mount();
    const video = el.querySelector('video');
    let asked = -1;
    Object.defineProperty(video, 'currentTime', {
      get: () => asked,
      set: (time) => (asked = time),
    });
    el.seek = { time: 2.5, n: 1 };
    await settle();
    expect(asked).to.equal(2.5);
    el.seek = { time: -3, n: 2 };
    await settle();
    expect(asked).to.equal(0);
    setTimeout(() => video.dispatchEvent(new Event('seeked')));
    const { detail } = await oneEvent(el, 'web-time');
    expect(detail).to.deep.equal({ time: 0, playing: false });
  });

  it('says when the recording is of an earlier version of the steps', async () => {
    const el = await mount({ stale: true });
    expect(el.querySelector('.badge').textContent).to.contain('earlier recording');
  });
});
