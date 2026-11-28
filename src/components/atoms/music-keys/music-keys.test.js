import { fixture, expect } from '@open-wc/testing';
import { settle } from '#utils/ui/testing/mockApi.js';
import './music-keys.js';

describe('music-keys', () => {
  it('has a key for every pitch, the highest on top, and names every C', async () => {
    const el = await fixture('<music-keys tonic="A" scale="minor"></music-keys>');
    await settle();
    const keys = [...el.querySelectorAll('button')];
    expect(keys.length).to.equal(128);
    expect([keys[0].dataset.pitch, keys[127].dataset.pitch]).to.deep.equal(['127', '0']);
    expect(
      keys
        .filter((key) => key.textContent.trim())
        .map((key) => key.textContent.trim())
        .slice(0, 2),
    ).to.deep.equal(['C9', 'C8']);
    expect(el.querySelector('[data-pitch="61"]').dataset.black).to.equal('true');
    expect(el.querySelector('[data-pitch="60"]').title).to.equal('C4');
  });

  it('marks the keys of the song’s scale and follows another key', async () => {
    const el = await fixture('<music-keys tonic="A" scale="minor"></music-keys>');
    await settle();
    const inScale = () =>
      [57, 58, 59, 60, 61].map(
        (pitch) => el.querySelector(`[data-pitch="${pitch}"]`).dataset.scale,
      );
    expect(inScale(), 'A, A#, B, C, C# in A minor').to.deep.equal([
      'true',
      'false',
      'true',
      'true',
      'false',
    ]);
    el.tonic = 'D';
    el.scale = 'major';
    await settle();
    expect(inScale(), 'in D major').to.deep.equal(['true', 'false', 'true', 'false', 'true']);
  });

  it('reports the pitch of a pressed key', async () => {
    const el = await fixture('<music-keys></music-keys>');
    await settle();
    const pressed = [];
    el.addEventListener('key-press', (event) => pressed.push(event.detail));
    el.querySelector('[data-pitch="69"]').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    expect(pressed).to.deep.equal([{ pitch: 69 }]);
  });
});
