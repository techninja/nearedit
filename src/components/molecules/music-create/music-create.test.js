import { fixture, expect, waitUntil } from '@open-wc/testing';
import { songToMidi, validateSong } from '#utils/music/index.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { auditionState, stopAudition } from '#utils/musicUi/audition.js';
import { setAuditionHost } from '#utils/musicUi/auditionHost.js';
import { interleaved } from '#utils/musicUi/auditionRender.js';
import { STARTERS, starterSong } from '#utils/musicUi/starters.js';
import { FakeAudioContext, fakeHost } from '#utils/musicUi/testing/fakeAudio.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './music-create.js';

async function mount() {
  const stage = await fixture('<div style="width:380px"><music-create></music-create></div>');
  const el = stage.querySelector('music-create');
  const added = [];
  el.addEventListener('music-add', (event) => added.push(event.detail));
  await settle();
  const tile = (id) => el.querySelector(`.music-create-add[data-id="${id}"]`);
  const play = (id) => el.querySelector(`.music-create-play[data-id="${id}"]`);
  return { el, added, tile, play };
}

describe('music-create', () => {
  let ctx;
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/fields.css',
      'styles/buttons.css',
      'styles/components-create.css',
    ]),
  );
  beforeEach(() => {
    ctx = new FakeAudioContext('suspended');
    setAuditionHost(fakeHost(ctx));
  });
  afterEach(() => {
    stopAudition();
    setAuditionHost();
  });

  it('offers an empty song, every named beat and the loops, each with its picture and a play button', async () => {
    const { el, tile, play } = await mount();
    expect(el.querySelectorAll('.music-create-tile').length).to.equal(STARTERS.length);
    expect(
      [...el.querySelectorAll('.field-group-title')].map((title) => title.textContent),
    ).to.deep.equal(['Start from nothing', 'Beats', 'Loops', 'From a file']);
    expect(tile('loop:house').textContent).to.contain('House').and.to.contain('124 BPM · 4 bars');
    expect(tile('loop:house').querySelectorAll('svg rect').length).to.be.greaterThan(50);
    expect(play('beat:trap').getAttribute('aria-label')).to.equal('Play Trap');
  });

  it('asks for a tile’s song to be added; only the empty one opens in the editor', async () => {
    const { added, tile } = await mount();
    tile('beat:bossa').click();
    tile('empty').click();
    expect(added.length).to.equal(2);
    expect(added[0].song).to.equal(starterSong('beat:bossa'));
    expect([added[0].open, added[1].open]).to.deep.equal([false, true]);
    expect(validateSong(added[0].song).problems).to.deep.equal([]);
  });

  it('plays a tile with the engine itself when its button is pressed, and stops on the second press', async () => {
    const { play } = await mount();
    play('beat:backbeat').click();
    await waitUntil(() => ctx.sources.length === 1, 'the song is rendered and started', {
      timeout: 4000,
    });
    expect(ctx.state, 'the press started the context').to.equal('running');
    expect(auditionState.get().owner).to.equal('starter:beat:backbeat');
    const samples = interleaved(ctx.sources[0].buffer);
    expect(Math.max(...samples.subarray(0, 9600))).to.be.greaterThan(0.2);
    await settle();
    expect(play('beat:backbeat').getAttribute('aria-pressed')).to.equal('true');
    expect(play('beat:backbeat').getAttribute('aria-label')).to.equal('Stop Backbeat');
    play('beat:trap').click();
    await waitUntil(() => ctx.sources.length === 2, 'another tile takes over', { timeout: 4000 });
    expect(ctx.sources[0].stopped).to.not.equal(null);
    play('beat:trap').click();
    await settle();
    expect(auditionState.get().playing).to.equal(false);
    expect(play('beat:trap').getAttribute('aria-pressed')).to.equal('false');
  });

  it('says so when the browser will not let sound start', async () => {
    const { el, play } = await mount();
    ctx.allowed = false;
    play('beat:trap').click();
    await waitUntil(() => el.querySelector('.error-message'));
    expect(el.querySelector('.error-message').textContent).to.contain('press Play again');
  });

  it('reads a MIDI file in the browser, adds its song and says what was left out', async () => {
    const { el, added } = await mount();
    const input = el.querySelector('input[type="file"]');
    const give = (file) => {
      const files = new DataTransfer();
      files.items.add(file);
      input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    give(new File([songToMidi(starterSong('loop:pop'))], 'My Tune.mid', { type: 'audio/midi' }));
    await waitUntil(() => added.length === 1);
    expect(added[0].label).to.equal('My Tune');
    expect(added[0].song.bpm).to.equal(108);
    expect(added[0].song.parts.map((part) => part.kind)).to.deep.equal([
      'drums',
      'synth',
      'synth',
      'synth',
    ]);
    await settle();
    expect(el.querySelector('.music-create-imported').textContent).to.contain('My Tune.mid');
    give(new File(['not midi at all'], 'notes.mid'));
    await waitUntil(() => el.querySelector('.music-create-problem'));
    expect(el.querySelector('.music-create-problem').textContent).to.contain(
      'notes.mid: This is not a MIDI file',
    );
    expect(added.length).to.equal(1);
  });
});
