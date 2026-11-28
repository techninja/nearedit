import { fixture, expect } from '@open-wc/testing';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import { settle } from '#utils/ui/testing/mockApi.js';
import './music-write.js';

async function mount() {
  const stage = await fixture('<div style="width:560px"><music-write></music-write></div>');
  const el = stage.querySelector('music-write');
  el.song = { key: 'A', scale: 'minor' };
  const asked = [];
  el.addEventListener('music-write', (event) => asked.push(event.detail.form));
  await settle();
  const button = (text) =>
    [...el.querySelectorAll('button')].find((each) => each.textContent.trim() === text);
  const change = (select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  return { el, asked, button, change };
}

describe('music-write', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/fields.css',
      'styles/buttons.css',
      'styles/components-create.css',
    ]),
  );

  it('offers common progressions in the song’s key and says what writing will do', async () => {
    const { el } = await mount();
    const chords = el.querySelector('select[aria-label="Chord progression"]');
    expect(chords.options[0].textContent.trim()).to.equal('Am F C G (i-VI-III-VII)');
    expect(chords.options.length).to.equal(6);
    expect(el.querySelector('.music-write-about').textContent)
      .to.contain('Am · F · C · G')
      .and.to.contain('4 bars long');
    el.song = { key: 'C', scale: 'major' };
    await settle();
    expect(chords.options[0].textContent.trim()).to.equal('C G Am F (I-V-vi-IV)');
  });

  it('asks for a bass line in a style, and for other notes with the next seed', async () => {
    const { el, asked, button, change } = await mount();
    change(el.querySelector('select[aria-label="Style"]'), 'walking');
    await settle();
    button('Write').click();
    button('Roll again').click();
    expect(asked).to.deep.equal([
      { what: 'bass', sequence: 'i-VI-III-VII', option: 'walking', seed: 1 },
      { what: 'bass', sequence: 'i-VI-III-VII', option: 'walking', seed: 2 },
    ]);
    await settle();
    expect(el.querySelector('input[aria-label="Seed"]').value).to.equal('2');
  });

  it('writes chords, an arpeggio in an order, or a melody', async () => {
    const { el, asked, button, change } = await mount();
    button('Arpeggio').click();
    await settle();
    expect(button('Arpeggio').getAttribute('aria-pressed')).to.equal('true');
    change(el.querySelector('select[aria-label="Order"]'), 'updown');
    button('Write').click();
    button('Melody').click();
    await settle();
    expect(el.querySelector('select[aria-label="Order"]'), 'a melody has no such choice').to.not
      .exist;
    button('Write').click();
    expect(asked.map((form) => [form.what, form.option])).to.deep.equal([
      ['arp', 'updown'],
      ['melody', ''],
    ]);
  });

  it('takes typed chords, shows what it reads, and writes on Enter', async () => {
    const { el, asked, change } = await mount();
    change(el.querySelector('select[aria-label="Chord progression"]'), '');
    await settle();
    const typed = el.querySelector('input[aria-label="Chords, typed"]');
    typed.value = 'Dm7 G7 Cmaj7';
    typed.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(el.querySelector('.music-write-about').textContent)
      .to.contain('Dm7 · G7 · Cmaj7')
      .and.to.contain('3 bars');
    typed.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(asked[0].sequence).to.equal('Dm7 G7 Cmaj7');
    typed.value = '???';
    typed.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(el.querySelector('.music-write-about').textContent).to.contain(
      'No chord can be read yet',
    );
    el.problem = 'No chord could be read — try Am F C G';
    await settle();
    expect(el.querySelector('.music-write-about').textContent).to.contain('try Am F C G');
  });
});
