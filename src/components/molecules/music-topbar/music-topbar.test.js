import { fixture, expect } from '@open-wc/testing';
import { normalizeSong } from '#utils/music/index.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { testSong } from '#utils/musicUi/testkit.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './music-topbar.js';

async function mount(more = {}) {
  const song = normalizeSong({ ...testSong(), bars: 8, swing: 0.25 });
  const stage = await fixture('<div style="width:900px"><music-topbar></music-topbar></div>');
  const el = stage.querySelector('music-topbar');
  Object.assign(el, { song, loop: [0, 8], ...more });
  const seen = [];
  for (const type of ['music-transport', 'field-change']) {
    el.addEventListener(type, (event) => seen.push([type, event.detail]));
  }
  await settle();
  const of = (type) => seen.filter(([name]) => name === type).map(([, detail]) => detail);
  const box = (name) => el.querySelector(`field-number[name="${name}"] input.field-num`);
  return { el, of, box };
}

describe('music-topbar', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/fields.css',
      'styles/buttons.css',
      'styles/components-create.css',
    ]),
  );

  it('shows the song as a whole: tempo, swing, length, key and scale, and the mix bus', async () => {
    const { el, box } = await mount();
    const names = [...el.querySelectorAll('field-number')].map((field) =>
      field.getAttribute('name'),
    );
    expect(names).to.deep.equal([
      ...['bpm', 'swing', 'bars', 'beatsPerBar', 'master.volume'],
      ...[
        'master.reverb.size',
        'master.reverb.decay',
        'master.delay.beats',
        'master.delay.feedback',
        'tail',
      ],
    ]);
    expect([box('bpm').value, box('swing').value, box('bars').value]).to.deep.equal([
      '120',
      '25',
      '8',
    ]);
    expect(el.querySelector('select[data-name="key"]').value).to.equal('C');
    expect(el.querySelector('select[data-name="scale"]').options.length).to.be.greaterThan(10);
  });

  it('reports a typed tempo and a chosen scale as fields of the song', async () => {
    const { el, of, box } = await mount();
    box('bpm').focus();
    box('bpm').value = '96';
    box('bpm').dispatchEvent(new Event('input', { bubbles: true }));
    box('bpm').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const scale = el.querySelector('select[data-name="scale"]');
    scale.value = 'dorian';
    scale.dispatchEvent(new Event('change', { bubbles: true }));
    expect(of('field-change')).to.deep.equal([
      { name: 'bpm', value: 96, phase: 'commit' },
      { name: 'scale', value: 'dorian', phase: 'commit' },
    ]);
  });

  it('asks to play and to stop, and shows which of the two a press will do', async () => {
    const { el, of } = await mount();
    const play = el.querySelector('.music-topbar-play');
    expect([play.textContent.trim(), play.getAttribute('aria-pressed')]).to.deep.equal([
      'Play',
      'false',
    ]);
    play.click();
    expect(of('music-transport')).to.deep.equal([{ action: 'toggle' }]);
    el.audition = { owner: 'editor', playing: true, rendering: false, problem: '' };
    await settle();
    expect([play.textContent.trim(), play.getAttribute('aria-pressed')]).to.deep.equal([
      'Stop',
      'true',
    ]);
    el.audition = { owner: 'starter:x', playing: true, rendering: false, problem: '' };
    await settle();
    expect(play.textContent.trim(), 'somebody else is playing').to.equal('Play');
  });

  it('sets the bars that repeat, counted from one, and keeps at least one bar', async () => {
    const { el, of } = await mount();
    const [from, to] = el.querySelectorAll('.music-topbar-loop input');
    expect([from.value, to.value]).to.deep.equal(['1', '8']);
    const type = (input, value) => {
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    type(from, '3');
    type(to, '99');
    type(from, 'x');
    expect(of('field-change')).to.deep.equal([
      { name: 'loop', value: [2, 8], phase: 'commit' },
      { name: 'loop', value: [0, 8], phase: 'commit' },
    ]);
    el.loop = [4, 6];
    await settle();
    type(to, '2');
    expect(of('field-change').at(-1).value, 'the start gives way').to.deep.equal([1, 2]);
    const whole = el.querySelector('.music-topbar-loop .btn');
    expect(whole.disabled).to.equal(false);
    whole.click();
    expect(of('field-change').at(-1).value).to.deep.equal([0, 0]);
  });

  it('says why nothing sounds', async () => {
    const { el } = await mount({
      audition: { owner: '', playing: false, problem: 'No sound yet' },
    });
    expect(el.querySelector('.error-message').textContent).to.equal('No sound yet');
  });
});
