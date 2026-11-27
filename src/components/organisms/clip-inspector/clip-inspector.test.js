import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { findClip } from '#utils/edl/query.js';
import { canUndo, getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { loadStyles } from '#utils/media/testing/fakeServer.js';
import './clip-inspector.js';

const media = (clipId, extra = {}) =>
  createClip({
    clipId,
    sourceFile: '/media/talk.mp4',
    sourceOut: 6,
    timelineStart: 2,
    timelineEnd: 8,
    label: 'Talk',
    ...extra,
  });
const document = () =>
  createEdl({
    tracks: [
      createTrack('video', {
        trackId: 'v0',
        name: 'Titles',
        clips: [createClip({ clipId: 't', timelineEnd: 3, text: { content: 'Hello' } })],
      }),
      createTrack('video', {
        trackId: 'v1',
        name: 'Video 1',
        clips: [
          media('v', { linkedClipId: 'a' }),
          createClip({
            clipId: 'pic',
            sourceFile: '/media/p.jpg',
            timelineStart: 10,
            timelineEnd: 15,
            transform: { opacity: 0.5 },
          }),
        ],
      }),
      createTrack('audio', {
        trackId: 'a1',
        name: 'Audio 1',
        clips: [media('a', { linkedClipId: 'v' })],
      }),
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

async function mount(selection = []) {
  loadDoc(document());
  await store.set(ViewState, { selection, playheadPosition: 0, cursorPosition: 0 });
  const stage = await fixture(
    '<div style="display:flex;width:320px;height:800px"><clip-inspector></clip-inspector></div>',
  );
  const el = stage.querySelector('clip-inspector');
  await waitUntil(() => el.querySelector('.clip-inspector'));
  return el;
}

describe('clip-inspector', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/editor.css',
      'styles/fields.css',
      'styles/components-panels.css',
    ]),
  );

  it('shows the document when nothing is selected', async () => {
    const el = await mount();
    const text = el.querySelector('inspector-document').textContent.replace(/\s+/g, ' ');
    expect(text).to.contain('1920×1080 · 30 fps').and.to.contain('00:00:15:00');
    expect(text).to.contain('1 video, 1 audio, 1 still, 1 title');
    expect(text).to.contain('Titles').and.to.contain('Select a clip');
  });

  it('follows the selection: a linked pair shows as one clip with its groups', async () => {
    const el = await mount();
    await store.set(ViewState, { selection: ['v', 'a'] });
    await waitUntil(
      () => el.querySelector('.clip-inspector-heading'),
      'did not follow the selection',
    );
    expect(el.querySelector('.clip-inspector-heading').textContent.trim()).to.equal('Talk');
    expect(el.querySelector('.clip-inspector-detail').textContent).to.contain(
      'video + audio · Video 1 + Audio 1',
    );
    expect(num(el, 'timing.start').value).to.equal('00:00:02:00');
    expect(num(el, 'volume').value).to.equal('100');
    expect(num(el, 'transform.opacity').value).to.equal('100');
    expect(el.querySelector('inspector-text textarea')).to.equal(null);
  });

  it('edits through the session: one committed value is one undo step', async () => {
    const el = await mount(['v', 'a']);
    commit(num(el, 'transform.x'), '120');
    expect([clip('v').transform.x, clip('a').transform.x]).to.deep.equal([120, 0]);
    commit(num(el, 'timing.start'), '00:00:04:00');
    expect([clip('v').timelineStart, clip('a').timelineStart]).to.deep.equal([4, 4]);
    await waitUntil(() => num(el, 'timing.start').value === '00:00:04:00');
    expect(steps()).to.equal(2);
    expect(clip('v').timelineStart).to.equal(2);
  });

  it('groups a continuous edit (typing a label) into one undo step', async () => {
    const el = await mount(['v', 'a']);
    const label = el.querySelector('[data-name="label"]');
    for (const text of ['I', 'In', 'Int', 'Intro']) {
      label.value = text;
      label.dispatchEvent(new Event('input', { bubbles: true }));
      expect(clip('v').label).to.equal(text, 'live while typing');
    }
    expect(canUndo()).to.equal(false, 'nothing recorded until the edit ends');
    label.dispatchEvent(new Event('change', { bubbles: true }));
    expect([clip('v').label, clip('a').label]).to.deep.equal(['Intro', 'Intro']);
    expect(steps()).to.equal(1);
    expect(clip('v').label).to.equal('Talk');
  });

  it('ends a live edit when the pointer goes down elsewhere', async () => {
    const el = await mount(['v', 'a']);
    const slider = el.querySelector('field-number[name="volume"] input[type=range]');
    slider.value = '0.4';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(clip('a').volume).to.equal(0.4);
    expect(canUndo()).to.equal(false);
    window.document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(canUndo()).to.equal(true);
    expect(steps()).to.equal(1);
  });

  it('shows mixed values for several clips and applies a change to all of them', async () => {
    const el = await mount(['v', 'pic']);
    expect(el.querySelector('.clip-inspector-heading').textContent.trim()).to.equal('2 clips');
    const opacity = num(el, 'transform.opacity');
    expect([opacity.value, opacity.getAttribute('placeholder')]).to.deep.equal(['', '—']);
    expect(num(el, 'timing.start')).to.equal(null);
    commit(opacity, '80');
    expect([clip('v').transform.opacity, clip('pic').transform.opacity]).to.deep.equal([0.8, 0.8]);
    expect(steps()).to.equal(1);
  });

  it('edits a title: text, style buttons and presets for pictures', async () => {
    const el = await mount(['t']);
    const area = el.querySelector('inspector-text textarea');
    expect(area.value).to.equal('Hello');
    area.value = 'Hello\nworld';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    area.dispatchEvent(new Event('change', { bubbles: true }));
    expect(clip('t').text.content).to.equal('Hello\nworld');
    el.querySelector('[data-name="text.italic"]').click();
    el.querySelector('[data-name="text.align"][data-value="right"]').click();
    expect([clip('t').text.italic, clip('t').text.align]).to.deep.equal([true, 'right']);
    expect(el.querySelector('inspector-motion input')).to.equal(null, 'no Ken Burns on a title');
    await store.set(ViewState, { selection: ['pic'] });
    await waitUntil(() => el.querySelector('inspector-motion [data-value="zoom-in"]'));
    el.querySelector('inspector-motion [data-value="zoom-in"]').click();
    expect(clip('pic').transform.kenBurns).to.include({
      enabled: true,
      startScale: 1,
      endScale: 1.2,
    });
    await waitUntil(
      () =>
        el.querySelector('inspector-motion [data-value="zoom-in"]').getAttribute('aria-pressed') ===
        'true',
    );
  });

  it('follows undo and redo done elsewhere', async () => {
    const el = await mount(['v', 'a']);
    commit(num(el, 'transform.rotation'), '45');
    await waitUntil(() => num(el, 'transform.rotation').value === '45');
    undo();
    await waitUntil(() => num(el, 'transform.rotation').value === '0', 'field did not follow undo');
  });
});
