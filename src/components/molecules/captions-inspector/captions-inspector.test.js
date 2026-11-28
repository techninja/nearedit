import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import AppState from '#store/AppState.js';
import { styleView } from '#utils/captionsUi/styleView.js';
import { MEMO, TALK, TALK_SIDECAR, talkDoc } from '#utils/captionsUi/testkit.js';
import { transcribeState } from '#utils/captionsUi/transcribe.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { setCaptions } from '#utils/edl/index.js';
import { clipOf, testClip, testEdl } from '#utils/edl/testkit.js';
import { inspectorModel } from '#utils/inspector/model.js';
import { intelligenceStatus } from '#utils/media/analyze.js';
import { forgetSidecars } from '#utils/media/sidecars.js';
import { installFakeServer, loadStyles } from '#utils/media/testing/fakeServer.js';
import { pinTranscript, pinnedTranscript } from '#utils/transcript/pin.js';
import './captions-inspector.js';

const CAN = { transcription: { provider: 'whisper', available: true, detail: '' } };
const CANNOT = {
  transcription: { provider: 'none', available: false, detail: 'TRANSCRIBE_PROVIDER=none' },
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
let sidecars;
async function mount(selection, { doc = talkDoc(), status = CAN, routes = {} } = {}) {
  server?.restore();
  sidecars = { [TALK]: TALK_SIDECAR };
  server = installFakeServer({
    'GET /api/sidecar': ({ url }) => sidecars[url.searchParams.get('path')] || { exists: false },
    'GET /api/intelligence/status': status,
    'GET /api/media': { data: [], total: 0 },
    ...routes,
  });
  forgetSidecars();
  await intelligenceStatus({ refresh: true });
  transcribeState.set({ byFile: {}, provider: null });
  styleView.set({ open: false });
  pinTranscript('');
  loadDoc(doc);
  const el = await fixture('<captions-inspector></captions-inspector>');
  const show = () => (el.model = inspectorModel(getDoc(), selection, 0));
  show();
  await wait(80);
  return { el, show };
}
const line = (el) => el.querySelector('.captions-inspector-line');
const box = (el) => el.querySelector('input[type=checkbox]');

describe('captions-inspector', () => {
  before(() => loadStyles(['styles/tokens.css', 'styles/fields.css']));
  afterEach(() => server?.restore());

  it('shows for a clip that speaks: the switch, and how many words it plays', async () => {
    const { el } = await mount(['v', 'a']);
    await waitUntil(() => line(el)?.dataset.kind === 'words');
    expect(el.querySelector('.field-group-title').textContent).to.equal('Captions');
    expect(box(el).checked).to.equal(false);
    expect(line(el).textContent.trim()).to.equal('8 words');
    expect(line(el).querySelector('button')).to.equal(null);
  });

  it('switches captions on for the voice — the sound clip of a pair — as one undo step', async () => {
    const { el, show } = await mount(['v']);
    box(el).click();
    expect(clipOf(getDoc(), 'a').captions).to.deep.equal({ on: true });
    expect('captions' in clipOf(getDoc(), 'v')).to.equal(false);
    show();
    await waitUntil(() => box(el).checked);
    expect(el.querySelector('.switch').textContent.trim()).to.equal('On');
    expect(undo()).to.equal(true);
    expect(undo()).to.equal(false);
  });

  it('is not there for clips that cannot speak', async () => {
    const title = testClip('t', 0, 3, { sourceFile: '', text: { content: 'Hello' } });
    const { el } = await mount(['t'], { doc: testEdl({ v1: [title] }) });
    expect(el.querySelector('.field-group-title')).to.equal(null);
    expect(el.textContent.trim()).to.equal('');
  });

  it('offers to transcribe a file without a transcript; captions then appear by themselves', async () => {
    const job = { id: 'j2', type: 'transcribe', status: 'running', progress: 0, log: [] };
    const { el, show } = await mount(['memo'], {
      routes: {
        'POST /api/intelligence/transcribe': [202, { jobId: 'j2' }],
        'GET /api/jobs/j2': () => job,
        'GET /api/jobs/j2/result': { outcome: 'ok' },
      },
    });
    await waitUntil(() => line(el)?.dataset.kind === 'missing');
    expect(line(el).textContent.replace(/\s+/g, ' ').trim()).to.equal(
      'No transcript yet Transcribe',
    );
    line(el).querySelector('button').click();
    expect(clipOf(getDoc(), 'memo').captions.on).to.equal(true);
    show();
    await waitUntil(() => server.calls.some((call) => call.path === '/api/jobs/j2'));
    server.push({ type: 'job_update', job: { ...job, progress: 40, log: ['chunk 2 of 5'] } });
    await waitUntil(() => line(el).dataset.kind === 'transcribing');
    expect(line(el).textContent).to.contain('Transcribing… 40 %');
    expect(el.querySelector('.progress-bar').style.width).to.equal('40%');
    expect(line(el).querySelector('button').dataset.action).to.equal('cancel');
    sidecars[MEMO] = { transcript: [{ word: 'Testing', start: 1, end: 2 }] };
    server.push({ type: 'job_update', job: { ...job, status: 'complete', progress: 100 } });
    await waitUntil(() => line(el).dataset.kind === 'words', 'no further click');
    expect(line(el).textContent.trim()).to.equal('1 word');
    expect(box(el).checked).to.equal(true);
  });

  it('explains a server that cannot transcribe', async () => {
    const { el } = await mount(['memo'], { status: CANNOT });
    await waitUntil(() => line(el)?.dataset.kind === 'unavailable');
    expect(line(el).textContent.trim()).to.equal('This server cannot transcribe');
    expect(line(el).querySelector('button')).to.equal(null);
    const why = el.querySelector('.captions-inspector-why');
    expect(why.querySelector('summary').textContent).to.equal('Why?');
    expect(why.querySelector('p').textContent).to.contain('TRANSCRIBE_PROVIDER=none');
  });

  it('says why a transcription failed and offers to try again', async () => {
    const { el } = await mount(['memo'], {
      routes: { 'POST /api/intelligence/transcribe': [500, { error: 'whisper crashed' }] },
    });
    await waitUntil(() => line(el)?.dataset.kind === 'missing');
    line(el).querySelector('button').click();
    await waitUntil(() => line(el).dataset.kind === 'failed');
    expect(line(el).querySelector('button').textContent.trim()).to.equal('Try again');
    expect(el.querySelector('.captions-inspector-why p').textContent).to.equal('whisper crashed');
  });

  it('opens the transcript panel on the clip’s file with “Edit words”', async () => {
    const { el } = await mount(['v']);
    pinTranscript('/media/other.mp4');
    await store.set(AppState, { dockTab: 'inspector' });
    el.querySelector('.captions-inspector-words').click();
    await waitUntil(() => store.get(AppState).dockTab === 'transcript');
    expect(pinnedTranscript()).to.equal(TALK);
  });

  it('unfolds the timeline’s style in place', async () => {
    const { el } = await mount(['v']);
    const fold = el.querySelector('.captions-inspector-fold');
    expect(fold.getAttribute('aria-expanded')).to.equal('false');
    expect(el.querySelector('captions-style')).to.equal(null);
    fold.click();
    await waitUntil(() => el.querySelector('captions-style .captions-style-tile'));
    expect(fold.getAttribute('aria-expanded')).to.equal('true');
    expect(el.querySelector('captions-style').plain).to.equal(true);
    el.querySelector('.captions-style-tile[data-preset="karaoke"]').click();
    expect(getDoc().captions.style).to.deep.equal({ preset: 'karaoke' });
    fold.click();
    await waitUntil(() => !el.querySelector('captions-style'));
  });

  it('switches several voices at once and says how many are on', async () => {
    const { el, show } = await mount(['v', 'memo', 'bed'], { doc: setCaptions(talkDoc(), ['a']) });
    expect(el.querySelector('.switch').textContent.trim()).to.equal('On for 1 of 3 selected');
    expect(box(el).indeterminate).to.equal(true);
    expect(line(el)).to.equal(null);
    expect(el.querySelector('.captions-inspector-words')).to.equal(null);
    box(el).click();
    show();
    await waitUntil(() => el.querySelector('.switch').textContent.includes('3 of 3'));
    expect(['a', 'memo', 'bed'].every((id) => clipOf(getDoc(), id).captions?.on)).to.equal(true);
    expect(undo()).to.equal(true);
    expect(clipOf(getDoc(), 'memo').captions).to.equal(undefined);
  });

  it('cannot be changed on a locked track', async () => {
    const doc = talkDoc();
    const locked = {
      ...doc,
      tracks: doc.tracks.map((t) => ({ ...t, locked: t.trackId === 'a1' })),
    };
    const { el } = await mount(['memo'], { doc: locked });
    await waitUntil(() => line(el)?.dataset.kind === 'missing');
    expect(box(el).disabled).to.equal(true);
    expect(line(el).querySelector('button').disabled).to.equal(true);
  });
});
