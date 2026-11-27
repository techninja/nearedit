import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { findClip } from '#utils/edl/query.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import './clip-inspector.js';

const BLUR = { effectId: 'fx_b', type: 'blur', enabled: true, params: { radius: 8 } };
const document = () =>
  createEdl({
    tracks: [
      createTrack('video', {
        trackId: 'v0',
        name: 'Titles',
        clips: [
          createClip({ clipId: 't', timelineEnd: 6, text: { content: 'Hello' }, effects: [BLUR] }),
        ],
      }),
      createTrack('video', {
        trackId: 'v1',
        name: 'Video 1',
        clips: [
          createClip({
            clipId: 'g',
            timelineEnd: 6,
            label: 'Gradient',
            generator: { type: 'gradient', seed: 5, params: {} },
          }),
        ],
      }),
      createTrack('audio', { trackId: 'a1', name: 'Audio 1' }),
    ],
  });
const clip = (id) => findClip(getDoc(), id).clip;
const steps = () => {
  let n = 0;
  while (undo()) n++;
  return n;
};
const num = (el, name) => el.querySelector(`field-number[name="${name}"] input.field-num`);
const commit = (input, text) => {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};
const diamond = (el, path) =>
  el.querySelector(`keyframe-control[data-path="${path}"] .keyframe-control-key`);
const seek = (time) => store.set(ViewState, { playheadPosition: time, cursorPosition: time });

async function mount(view) {
  loadDoc(document());
  await store.set(ViewState, { selection: [], activeTrackId: '', playheadPosition: 0, ...view });
  const stage = await fixture(
    '<div style="display:flex;width:380px;height:900px"><clip-inspector></clip-inspector></div>',
  );
  const el = stage.querySelector('clip-inspector');
  await waitUntil(() => el.querySelector('.clip-inspector'));
  return el;
}

describe('clip-inspector: generators, effects, keyframes, tracks', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/editor.css',
      'styles/fields.css',
      'styles/components-panels.css',
    ]),
  );

  it('edits a generator through controls built from its schema', async () => {
    const el = await mount({ selection: ['g'] });
    await waitUntil(() => num(el, 'generator.params.angle'));
    expect(el.querySelector('.clip-inspector-detail').textContent).to.contain('generator');
    expect(el.querySelector('select[data-name="generator.type"]').value).to.equal('gradient');
    commit(num(el, 'generator.params.angle'), '45');
    expect(clip('g').generator.params).to.deep.equal({ angle: 45 });
    el.querySelector('button[aria-label="Shuffle the seed"]').click();
    expect(clip('g').generator.seed).to.not.equal(5);
    const type = el.querySelector('select[data-name="generator.type"]');
    type.value = 'solid';
    type.dispatchEvent(new Event('change', { bubbles: true }));
    await waitUntil(() => el.querySelector('field-color[name="generator.params.color"]'));
    expect(clip('g').generator.type).to.equal('solid');
    expect(steps()).to.equal(3);
  });

  it('shows the effect stack of the clip and applies its actions', async () => {
    const el = await mount({ selection: ['t'] });
    await waitUntil(() => el.querySelector('effect-card'));
    commit(num(el, 'effects.fx_b.radius'), '20');
    expect(clip('t').effects[0].params.radius).to.equal(20);
    el.querySelector('effect-card [data-action="toggle"]').click();
    expect(clip('t').effects[0].enabled).to.equal(false);
    el.querySelector('inspector-effects [data-action="copy"]').click();
    await waitUntil(() => !el.querySelector('inspector-effects [data-action="paste"]').disabled);
    await store.set(ViewState, { selection: ['g'] });
    await waitUntil(() => el.querySelector('inspector-effects')?.effects.length === 0);
    el.querySelector('inspector-effects [data-action="paste"]').click();
    expect(clip('g').effects.map((fx) => fx.type)).to.deep.equal(['blur']);
    expect(steps()).to.equal(3);
  });

  it('keys a field at the playhead, auto-keys edits and follows the playhead', async () => {
    const el = await mount({ selection: ['t'] });
    await waitUntil(() => diamond(el, 'transform.x'));
    diamond(el, 'transform.x').click();
    expect(clip('t').keyframes['transform.x']).to.deep.equal([{ t: 0, v: 0, ease: 'linear' }]);
    await waitUntil(() => el.querySelector('keyframe-strip .keyframe-strip-key'));
    await seek(2);
    await waitUntil(
      () => el.querySelector('keyframe-control[data-path="transform.x"]').state === 'between',
    );
    commit(num(el, 'transform.x'), '400');
    expect(clip('t').keyframes['transform.x'][1]).to.deep.equal({ t: 2, v: 400, ease: 'linear' });
    expect(clip('t').transform.x, 'the plain value stays').to.equal(0);
    await seek(1);
    await waitUntil(() => num(el, 'transform.x').value === '200');
    el.querySelector('keyframe-control[data-path="transform.x"] [data-step="next"]').click();
    await waitUntil(() => store.get(ViewState).playheadPosition === 2);
    expect(steps()).to.equal(2);
  });

  it('shows the focused track when no clip is selected: opacity, blend mode, effects', async () => {
    const el = await mount({ activeTrackId: 'v0' });
    await waitUntil(() => el.querySelector('inspector-track'));
    expect(el.querySelector('.clip-inspector-heading').textContent).to.contain('Titles');
    commit(num(el, 'track.opacity'), '50');
    const blend = el.querySelector('select[data-name="track.blendMode"]');
    blend.value = 'add';
    blend.dispatchEvent(new Event('change', { bubbles: true }));
    el.querySelector('.inspector-effects-add').click();
    await waitUntil(() => el.querySelector('effect-catalog .effect-catalog-item[data-key="glow"]'));
    el.querySelector('effect-catalog .effect-catalog-item[data-key="glow"]').click();
    const [track] = getDoc().tracks;
    expect([
      track.opacity,
      track.blendMode,
      track.effects.map((fx) => fx.type).join(),
    ]).to.deep.equal([0.5, 'add', 'glow']);
    await waitUntil(() => el.querySelector('effect-card'));
    expect(el.querySelector('effect-card keyframe-control'), 'tracks are not keyframed').to.equal(
      null,
    );
    await store.set(ViewState, { activeTrackId: 'a1' });
    await waitUntil(() => el.querySelector('field-number[name="track.volume"]'));
    expect(el.querySelector('inspector-effects')).to.equal(null);
    expect(el.querySelector('inspector-document'), 'the document summary follows').to.exist;
  });
});
