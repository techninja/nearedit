import { fixture, expect, waitUntil } from '@open-wc/testing';
import { normalizeSong } from '#utils/music/index.js';
import { playSong, stopAudition } from '#utils/musicUi/audition.js';
import { setAuditionHost } from '#utils/musicUi/auditionHost.js';
import { FakeAudioContext, fakeHost } from '#utils/musicUi/testing/fakeAudio.js';
import { testSong } from '#utils/musicUi/testkit.js';
import './music-playhead.js';

// Two bars of two seconds each.
const song = normalizeSong(testSong());
const frame = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

describe('music-playhead', () => {
  let ctx;
  beforeEach(() => {
    ctx = new FakeAudioContext();
    setAuditionHost(fakeHost(ctx));
  });
  afterEach(() => {
    stopAudition();
    setAuditionHost();
  });

  it('shows nothing while nothing plays', async () => {
    const line = await fixture('<music-playhead></music-playhead>');
    const words = await fixture('<music-playhead readout></music-playhead>');
    await frame();
    expect(line.querySelector('i').hidden).to.equal(true);
    expect(words.textContent.trim()).to.equal('–.–');
  });

  it('runs along the loop of its part while the editor plays, and says bar and beat', async () => {
    const line = await fixture('<music-playhead></music-playhead>');
    const words = await fixture('<music-playhead readout></music-playhead>');
    line.bars = 1;
    await playSong('editor', song, [0, 2]);
    ctx.currentTime += 0.04 + 2.5; // a quarter into the second bar
    await waitUntil(() => !line.querySelector('i').hidden);
    await frame();
    expect(line.querySelector('i').style.left, 'a one-bar loop starts again in bar 2').to.equal(
      '25%',
    );
    expect(words.textContent.trim()).to.equal('2.2');
    line.bars = 2;
    await frame();
    expect(line.querySelector('i').style.left).to.equal('62.5%');
    line.ranges = [[0, 1]];
    await frame();
    expect(line.querySelector('i').hidden, 'the part is silent in bar 2').to.equal(true);
    stopAudition('editor');
    await frame();
    expect(words.textContent.trim()).to.equal('–.–');
  });

  it('does not follow a tile of the Create tab', async () => {
    const line = await fixture('<music-playhead></music-playhead>');
    await playSong('starter:x', song, [0, 2]);
    ctx.currentTime += 1;
    await frame();
    expect(line.querySelector('i').hidden).to.equal(true);
  });
});
