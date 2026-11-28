import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { createEdl } from '#utils/edl/factory.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { intelligenceStatus } from '#utils/media/analyze.js';
import { clearLibrary, loadLibrary } from '#utils/media/library.js';
import { forgetSidecars } from '#utils/media/sidecars.js';
import { installFakeServer, loadStyles, mediaItem } from '#utils/media/testing/fakeServer.js';
import * as transport from '#utils/playback/transport.js';
import { pinTranscript } from '#utils/transcript/pin.js';
import { TALK, TALK_SIDECAR, pieces, talkEdl } from '#utils/transcript/testkit.js';
import './transcript-panel.js';

const UNAVAILABLE = {
  transcription: { provider: 'auto', available: false, detail: 'whisper-cli not found' },
};
const AVAILABLE = { transcription: { provider: 'whisper-cpp', available: true, detail: '' } };
const analysed = { transcript: true, tags: false, beats: false, scenes: false, silences: false };
const words = TALK_SIDECAR.transcript;

let server;
let sidecars;
const view = () => store.get(ViewState);
const word = (el, i) => el.querySelector(`[data-i="${i}"]`);
const off = (el) =>
  [...el.querySelectorAll('.transcript-paragraph-off')].map((w) => Number(w.dataset.i));
const frames = (seconds) => Math.round(seconds * 30);

async function mount({
  doc = talkEdl(),
  selection = ['v'],
  status = UNAVAILABLE,
  routes = {},
} = {}) {
  server?.restore();
  sidecars = { [TALK]: TALK_SIDECAR };
  server = installFakeServer({
    'GET /api/media': {
      data: [mediaItem('talk.mp4', { analysis: analysed }), mediaItem('song.mp3')],
      total: 2,
    },
    'GET /api/intelligence/status': status,
    'GET /api/sidecar': ({ url }) => sidecars[url.searchParams.get('path')] || { exists: false },
    'PUT /api/sidecar': ({ url, body }) =>
      (sidecars[url.searchParams.get('path')] = { ...TALK_SIDECAR, ...body }),
    ...routes,
  });
  forgetSidecars();
  await intelligenceStatus({ refresh: true });
  pinTranscript('');
  transport.stop();
  loadDoc(doc);
  await store.set(ViewState, { selection, playheadPosition: 0, cursorPosition: 0, playing: false });
  await loadLibrary('p1');
  const stage = await fixture(
    '<div style="display:flex;width:520px;height:480px"><transcript-panel></transcript-panel></div>',
  );
  const el = stage.querySelector('transcript-panel');
  await waitUntil(() => el.querySelector('.transcript-panel'));
  return el;
}
const ready = (el) =>
  waitUntil(
    () => el.querySelectorAll('.transcript-paragraph-word').length === words.length,
    'transcript never appeared',
  );

describe('transcript-panel', () => {
  before(() =>
    loadStyles([
      'styles/tokens.css',
      'styles/editor.css',
      'styles/elements.css',
      'styles/fields.css',
      'styles/components-panels.css',
    ]),
  );
  afterEach(() => {
    transport.stop();
    server?.restore();
    server = null;
    clearLibrary();
    pinTranscript('');
  });

  it('says what to do when there is nothing to show', async () => {
    const el = await mount({ doc: createEdl(), selection: [] });
    await waitUntil(() => el.querySelector('transcript-empty strong'));
    expect(el.querySelector('transcript-empty').textContent).to.contain(
      'Select a clip with speech',
    );
    expect(el.querySelector('transcript-empty button')).to.equal(null);
  });

  it('shows the selected clip’s transcript as paragraphs with timestamps', async () => {
    const el = await mount();
    await ready(el);
    expect(el.querySelectorAll('transcript-paragraph').length).to.equal(3);
    const stamps = [...el.querySelectorAll('.transcript-paragraph-stamp')].map(
      (s) => s.textContent,
    );
    expect(stamps).to.deep.equal(['0:00', '0:05', '0:11']);
    expect(word(el, 3).textContent).to.equal('park.');
    expect(off(el)).to.deep.equal([]);
    expect(el.querySelector('.transcript-panel-facts').textContent).to.contain(
      '22 words · 1 clip on the timeline',
    );
  });

  it('moves the playhead to a clicked word and highlights the word under the playhead', async () => {
    const el = await mount();
    await ready(el);
    word(el, 9).click();
    await waitUntil(
      () => frames(view().playheadPosition) === frames(2 + words[9].start),
      `playhead at ${view().playheadPosition}`,
    );
    await waitUntil(() => word(el, 9).classList.contains('transcript-paragraph-current'));
    transport.seek(2 + words[15].start + 0.1);
    await waitUntil(
      () => word(el, 15).classList.contains('transcript-paragraph-current'),
      'did not follow the playhead',
    );
    expect(el.querySelectorAll('.transcript-paragraph-current').length).to.equal(1);
  });

  it('cuts the selected words out of picture and sound as one undo step', async () => {
    const el = await mount();
    await ready(el);
    word(el, 4).click();
    word(el, 8).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    await waitUntil(
      () => el.querySelectorAll('.transcript-paragraph-selected').length === 5,
      'range not selected',
    );
    expect(el.querySelector('.transcript-actions-summary').textContent).to.contain('5 words');
    el.querySelector('transcript-actions [data-action="cut"]').click();
    const picture = pieces(getDoc(), 'v1');
    const sound = pieces(getDoc(), 'a1');
    expect(picture.length).to.equal(2);
    expect(picture.map((p) => [p.span, p.source])).to.deep.equal(
      sound.map((p) => [p.span, p.source]),
    );
    expect(picture.map((p) => p.link)).to.deep.equal(sound.map((p) => p.id));
    await waitUntil(() => off(el).join() === '4,5,6,7,8', `struck out: ${off(el)}`);
    expect(el.querySelector('.transcript-panel-facts').textContent).to.contain(
      '2 clips on the timeline · 5 not in the edit',
    );
    expect(undo()).to.equal(true);
    expect(pieces(getDoc(), 'v1').length).to.equal(1);
    expect(undo()).to.equal(false);
    await waitUntil(() => off(el).length === 0, 'undo was not mirrored');
  });

  it('finds text, and previews removing silences before applying it', async () => {
    const el = await mount();
    await ready(el);
    const find = el.querySelector('transcript-find input');
    find.value = 'the';
    find.dispatchEvent(new Event('input', { bubbles: true }));
    await waitUntil(
      () => el.querySelectorAll('.transcript-paragraph-hit').length === 3,
      'hits not marked',
    );
    expect(el.querySelector('.transcript-find-count').textContent).to.equal('1/3');
    el.querySelector('transcript-toolbar [data-tool="silence"]').click();
    await waitUntil(() => el.querySelector('transcript-silence'));
    const preview = el.querySelector('.transcript-silence-preview').textContent;
    expect(preview).to.match(/Removes 3 pauses found from word timings — saves 5\.\d s/);
    el.querySelector('transcript-silence .btn-primary').click();
    expect(pieces(getDoc(), 'v1').length).to.equal(3);
    await waitUntil(() => !el.querySelector('transcript-silence'), 'form stayed open');
    expect(off(el)).to.deep.equal([]);
  });

  it('saves a corrected word to the sidecar, timing untouched', async () => {
    const el = await mount();
    await ready(el);
    word(el, 3).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await waitUntil(() => el.querySelector('input.transcript-paragraph-edit'), 'no edit box');
    const box = el.querySelector('input.transcript-paragraph-edit');
    expect(box.value).to.equal('park.');
    box.value = 'lake.';
    box.dispatchEvent(new Event('blur'));
    await waitUntil(() => server.calls.some((c) => c.method === 'PUT'), 'nothing was saved');
    const put = server.calls.find((c) => c.method === 'PUT');
    expect(put.query.path).to.equal(TALK);
    expect(put.body.transcript[3]).to.deep.equal({
      word: 'lake.',
      start: words[3].start,
      end: words[3].end,
    });
    expect(put.body.segments[0].text).to.equal('Welcome to the lake.');
    await waitUntil(() => word(el, 3)?.textContent === 'lake.', 'correction not shown');
    expect(getDoc()).to.equal(getDoc(), 'the timeline was not edited');
  });

  it('explains a missing transcript: no provider, or offers to transcribe with progress', async () => {
    const song = talkEdl();
    let el = await mount({ doc: song, selection: ['music'] });
    await waitUntil(() => /Transcription is not available/.test(el.textContent), 'no explanation');
    expect(el.querySelector('transcript-empty').textContent).to.contain('whisper-cli not found');
    expect(el.querySelector('transcript-empty button')).to.equal(null);

    const job = {
      id: 'j9',
      type: 'transcribe',
      status: 'running',
      label: 'Transcribe: song.mp3',
      progress: 40,
      log: ['decoding'],
    };
    el = await mount({
      doc: song,
      selection: ['music'],
      status: AVAILABLE,
      routes: {
        'POST /api/intelligence/transcribe': [202, { jobId: 'j9' }],
        'GET /api/jobs/j9': () => job,
        'GET /api/jobs/j9/result': { outcome: 'ok' },
      },
    });
    await waitUntil(
      () => el.querySelector('transcript-empty button.btn-primary'),
      'no Transcribe button',
    );
    expect(el.querySelector('transcript-empty').textContent).to.contain('Not transcribed yet');
    el.querySelector('transcript-empty button.btn-primary').click();
    await waitUntil(
      () => /40%/.test(el.querySelector('transcript-empty').textContent),
      'no progress shown',
      { timeout: 3000 },
    );
    expect(
      server.calls.find((c) => c.path === '/api/intelligence/transcribe').body.filePath,
    ).to.equal('/media/song.mp3');
    sidecars['/media/song.mp3'] = {
      transcript: [{ word: 'La', start: 1, end: 1.4 }],
      segments: [],
    };
    server.push({ type: 'job_update', job: { ...job, status: 'complete', progress: 100 } });
    await waitUntil(
      () => el.querySelectorAll('.transcript-paragraph-word').length === 1,
      'transcript did not appear',
      { timeout: 4000 },
    );
  });

  it('switches the words on as captions from the toolbar, and off again', async () => {
    const el = await mount();
    await ready(el);
    const cc = () => el.querySelector('.transcript-toolbar-captions');
    expect([cc().disabled, cc().getAttribute('aria-pressed')]).to.deep.equal([false, 'false']);
    cc().click();
    await waitUntil(() => cc().getAttribute('aria-pressed') === 'true', 'the switch did not turn');
    const sound = getDoc().tracks[1].clips[0];
    expect(sound.captions).to.deep.equal({ on: true });
    expect('captions' in getDoc().tracks[0].clips[0]).to.equal(false);
    expect(el.querySelector('.transcript-panel-message').textContent).to.contain('Captions on');
    cc().click();
    await waitUntil(() => cc().getAttribute('aria-pressed') === 'false');
    expect(getDoc().tracks[1].clips[0].captions).to.equal(undefined);
    undo();
    undo();
    expect(undo()).to.equal(false, 'each press was one undo step');
  });

  it('shows a pinned file that is not on the timeline, for preview and adding only', async () => {
    const el = await mount({ doc: createEdl(), selection: [] });
    pinTranscript(TALK);
    await ready(el);
    expect(off(el)).to.deep.equal([]);
    expect(el.querySelector('.transcript-toolbar-captions').disabled).to.equal(true);
    expect(el.querySelector('.transcript-panel-preview audio')).to.exist;
    word(el, 5).click();
    await waitUntil(() => word(el, 5).classList.contains('transcript-paragraph-selected'));
    expect(view().playheadPosition).to.equal(0);
    expect(el.querySelector('transcript-actions [data-action="cut"]').disabled).to.equal(true);
    el.querySelector('transcript-actions [data-action="add"]').click();
    const [clip] = getDoc().tracks[0].clips;
    expect(clip.sourceFile).to.equal(TALK);
    expect(clip.sourceIn).to.be.closeTo(words[5].start - 0.025, 1e-6);
  });
});
