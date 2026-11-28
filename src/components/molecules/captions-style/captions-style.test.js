import { fixture, expect, waitUntil } from '@open-wc/testing';
import { TALK, TALK_SIDECAR, talkDoc } from '#utils/captionsUi/testkit.js';
import { transcribeState } from '#utils/captionsUi/transcribe.js';
import { canUndo, getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { patchCaptionStyle, setCaptions } from '#utils/edl/index.js';
import { clipOf } from '#utils/edl/testkit.js';
import { intelligenceStatus } from '#utils/media/analyze.js';
import { forgetSidecars } from '#utils/media/sidecars.js';
import { installFakeServer, loadStyles } from '#utils/media/testing/fakeServer.js';
import './captions-style.js';

const CAN = { transcription: { provider: 'whisper', available: true, detail: '' } };
const CANNOT = { transcription: { provider: 'none', available: false, detail: 'switched off' } };
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const style = () => getDoc().captions?.style;
const steps = () => {
  let n = 0;
  while (undo()) n++;
  return n;
};

let server;
async function mount({ doc = talkDoc(), status = CAN, plain = false, routes = {} } = {}) {
  server?.restore();
  const sidecars = { [TALK]: TALK_SIDECAR };
  server = installFakeServer({
    'GET /api/sidecar': ({ url }) => sidecars[url.searchParams.get('path')] || { exists: false },
    'GET /api/intelligence/status': status,
    ...routes,
  });
  forgetSidecars();
  await intelligenceStatus({ refresh: true });
  transcribeState.set({ byFile: {}, provider: null });
  loadDoc(doc);
  const el = await fixture(
    `<div style="width:360px"><captions-style${plain ? ' plain' : ''}></captions-style></div>`,
  );
  await waitUntil(() => el.querySelector('.captions-style-tile'));
  await wait(60);
  return { el: el.querySelector('captions-style'), sidecars };
}
const field = (el, path) => el.querySelector(`field-number[name="captions.style.${path}"]`);
const type = (input, text) => {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};

describe('captions-style', () => {
  before(() => loadStyles(['styles/tokens.css', 'styles/fields.css']));
  afterEach(() => server?.restore());

  it('says where the timeline’s captions stand and lists what lacks a transcript', async () => {
    const { el } = await mount();
    await waitUntil(() => el.querySelectorAll('.captions-style-missing').length === 2);
    expect(el.querySelector('.captions-style-state').textContent).to.equal(
      'Off — 3 clips with sound',
    );
    const rows = [...el.querySelectorAll('.captions-style-missing')];
    expect(rows.map((row) => row.dataset.file)).to.deep.equal(['memo.wav', 'song.mp3']);
    expect(rows[0].querySelector('button').disabled).to.equal(false);
    expect(el.querySelector('.captions-style-save [data-format="srt"]').disabled).to.equal(true);
  });

  it('captions all speech in one step, and offers the subtitle files after', async () => {
    const { el } = await mount();
    el.querySelector('.captions-style-all').click();
    await waitUntil(() => clipOf(getDoc(), 'a').captions?.on === true);
    await waitUntil(() =>
      el.querySelector('.captions-style-state').textContent.startsWith('On for 1 of 3'),
    );
    expect(el.querySelector('.captions-style-state').textContent).to.contain('8 words');
    expect(clipOf(getDoc(), 'memo').captions).to.equal(undefined);
    expect(el.querySelector('.captions-style-save [data-format="vtt"]').disabled).to.equal(false);
    expect(steps()).to.equal(1);
  });

  it('transcribes a file from its row: captions go on at once, the row follows the job', async () => {
    const job = { id: 'j1', type: 'transcribe', status: 'running', progress: 0, log: [] };
    const { el, sidecars } = await mount({
      routes: {
        'POST /api/intelligence/transcribe': [202, { jobId: 'j1' }],
        'GET /api/jobs/j1': () => job,
        'GET /api/jobs/j1/result': { outcome: 'ok' },
        'GET /api/media': { data: [], total: 0 },
      },
    });
    await waitUntil(() => el.querySelector('.captions-style-missing[data-file="memo.wav"] button'));
    el.querySelector('.captions-style-missing[data-file="memo.wav"] button').click();
    expect(clipOf(getDoc(), 'memo').captions.on).to.equal(true);
    // The job is being followed once it has been asked about.
    await waitUntil(() => server.calls.some((c) => c.path === '/api/jobs/j1'));
    expect(server.calls.find((c) => c.method === 'POST').body.filePath).to.equal('/media/memo.wav');
    server.push({ type: 'job_update', job: { ...job, progress: 40, label: 'Transcribing' } });
    const row = () => el.querySelector('.captions-style-missing[data-file="memo.wav"]');
    await waitUntil(() => row().textContent.includes('40 %'));
    expect(row().dataset.tone).to.equal('warn');
    expect(row().querySelector('.progress-bar').style.width).to.equal('40%');
    sidecars['/media/memo.wav'] = { transcript: [{ word: 'Hi', start: 1, end: 2 }] };
    server.push({ type: 'job_update', job: { ...job, status: 'complete', progress: 100 } });
    await waitUntil(() => !row(), 'with a transcript the file is no longer listed');
    await waitUntil(() => el.querySelector('.captions-style-state').textContent.includes('1 word'));
  });

  it('says why a file cannot be transcribed here instead of offering to', async () => {
    const { el } = await mount({ status: CANNOT });
    await waitUntil(() => el.querySelector('.captions-style-missing button')?.disabled);
    const button = el.querySelector('.captions-style-missing button');
    expect(button.title).to.equal('This server cannot transcribe: switched off');
  });

  it('shows the five presets as tiles and switches with a press', async () => {
    const { el } = await mount();
    const tiles = [...el.querySelectorAll('.captions-style-tile')];
    expect(tiles.map((tile) => tile.dataset.preset)).to.deep.equal([
      'clean',
      'pop',
      'karaoke',
      'boxed',
      'minimal',
    ]);
    expect(tiles.map((tile) => tile.getAttribute('aria-pressed'))).to.deep.equal([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
    expect(el.querySelectorAll('caption-tile canvas').length).to.equal(5);
    tiles[1].click();
    await waitUntil(() => tiles[1].getAttribute('aria-pressed') === 'true');
    expect(style()).to.deep.equal({ preset: 'pop' });
    expect(el.querySelector('.captions-style-about').textContent).to.contain('Pop — Big capitals');
    expect(field(el, 'size').value).to.equal(7.4);
    expect(steps()).to.equal(1);
  });

  it('walks the tiles with the arrow keys without choosing', async () => {
    const { el } = await mount();
    const tiles = [...el.querySelectorAll('.captions-style-tile')];
    tiles[0].focus();
    tiles[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).to.equal(tiles[1]);
    tiles[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).to.equal(tiles[4]);
    tiles[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).to.equal(tiles[0]);
    expect(canUndo()).to.equal(false);
  });

  it('edits a field of the style, live changes as one undo step', async () => {
    const { el } = await mount();
    const size = field(el, 'size');
    const slider = size.querySelector('input[type=range]');
    for (const value of ['6', '7', '8']) {
      slider.value = value;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      expect(style().size).to.equal(Number(value));
    }
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await frame();
    type(size.querySelector('input.field-num'), '9.5');
    expect(style()).to.deep.equal({ preset: 'clean', size: 9.5 });
    const select = el.querySelector('select[data-name="captions.style.highlight.mode"]');
    select.value = 'scale';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitUntil(() => field(el, 'highlight.scale'), 'a field a choice reveals');
    expect(steps()).to.equal(3);
  });

  it('keeps its changes to itself: nothing reaches a listener above', async () => {
    const { el } = await mount();
    let heard = 0;
    el.parentElement.addEventListener('field-change', () => heard++);
    type(field(el, 'size').querySelector('input.field-num'), '6');
    const box = el.querySelector('input[data-name="captions.style.plate.on"]');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(style()).to.deep.equal({ preset: 'clean', size: 6, plate: { on: true } });
    expect(heard).to.equal(0);
  });

  it('counts what was changed and goes back to the preset', async () => {
    let doc = patchCaptionStyle(talkDoc(), 'preset', 'boxed');
    doc = patchCaptionStyle(patchCaptionStyle(doc, 'size', 6), 'plate.radius', 0);
    const { el } = await mount({ doc });
    const chips = [...el.querySelectorAll('details summary .chip')].map((c) => c.textContent);
    expect(chips).to.deep.equal(['1 changed', '1 changed']);
    const back = el.querySelector('.captions-style-back');
    expect(back.title).to.equal('Drop the 2 changed fields: Boxed as it comes');
    back.click();
    await waitUntil(() => !el.querySelector('.captions-style-back'));
    expect(style()).to.deep.equal({ preset: 'boxed' });
    expect(steps()).to.equal(1);
  });

  it('offers the document’s own fonts beside the bundled ones', async () => {
    const fonts = [{ family: 'Brand Sans', weight: 700, style: 'normal', file: '/p/b.woff2' }];
    const { el } = await mount({ doc: { ...talkDoc(), fonts } });
    const select = el.querySelector('select[data-name="captions.style.font.family"]');
    const groups = [...select.querySelectorAll('optgroup')].map((group) => group.label);
    expect(groups).to.deep.equal(['Bundled', 'This document']);
    select.value = 'Brand Sans';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(style()).to.deep.equal({ preset: 'clean', font: { family: 'Brand Sans' } });
  });

  it('shows only the style when asked to be plain', async () => {
    const { el } = await mount({ doc: setCaptions(talkDoc(), ['a']), plain: true });
    expect(el.querySelector('.captions-style-state')).to.equal(null);
    expect(el.querySelector('.captions-style-all')).to.equal(null);
    expect(el.querySelectorAll('.captions-style-tile').length).to.equal(5);
    expect(el.querySelectorAll('details').length).to.equal(7);
  });
});
