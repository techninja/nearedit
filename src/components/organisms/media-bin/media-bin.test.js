import { fixture, expect, waitUntil } from '@open-wc/testing';
import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { createEdl } from '#utils/edl/factory.js';
import { getDoc, loadDoc, undo } from '#utils/editor/session.js';
import { MEDIA_DRAG_TYPE, clearLibrary, loadLibrary } from '#utils/media/library.js';
import { installFakeServer, loadStyles, mediaItem } from '#utils/media/testing/fakeServer.js';
import './media-bin.js';

const STATUS = {
  ffmpeg: { available: true, detail: '6.1' },
  transcription: { provider: 'auto', available: false, detail: 'whisper-cli not found' },
  vision: { provider: 'ollama', available: true, detail: '' },
};
const analysed = { transcript: true, tags: false, beats: true, scenes: true, silences: true };
const LIBRARY = [
  mediaItem('talk.mp4', { duration: 21.4, tags: ['park'], analysis: analysed }),
  mediaItem('broll.mp4', { hasAudio: false }),
  mediaItem('song.mp3', { duration: 32 }),
  mediaItem('logo.png'),
  mediaItem('notes.md'),
];

let server;
let library;
const names = (el) => [...el.querySelectorAll('.media-row-name')].map((n) => n.textContent);
const row = (el, name) =>
  [...el.querySelectorAll('media-row')].find((r) => r.item.filename === name);
const view = () => store.get(ViewState);

async function mount(items = LIBRARY, routes = {}) {
  library = items;
  server?.restore();
  server = installFakeServer({
    'GET /api/media': () => ({ data: library, total: library.length }),
    'GET /api/intelligence/status': STATUS,
    'GET /api/sidecar': { exists: false },
    ...routes,
  });
  loadDoc(createEdl());
  await store.set(ViewState, {
    playheadPosition: 0,
    cursorPosition: 0,
    selection: [],
    ripple: false,
  });
  const stage = await fixture(
    '<div style="display:flex;width:320px;height:640px"><media-bin></media-bin></div>',
  );
  const el = stage.querySelector('media-bin');
  await loadLibrary('p1');
  await waitUntil(() => el.querySelectorAll('media-row').length > 0 || !items.length, 'no rows');
  return el;
}

describe('media-bin', () => {
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
    server?.restore();
    server = null;
    clearLibrary();
  });

  it('says something sensible before a project is open, and when it is empty', async () => {
    server = installFakeServer({ 'GET /api/intelligence/status': STATUS });
    const el = await fixture('<media-bin></media-bin>');
    await waitUntil(() => el.querySelector('.empty-state'));
    expect(el.querySelector('.media-bin-list .empty-state').textContent).to.contain(
      'Open a project',
    );
    const empty = await mount([]);
    await waitUntil(() => /No media in this project/.test(empty.textContent));
  });

  it('lists the library with facts, thumbnails and analysis badges', async () => {
    const el = await mount();
    expect(names(el)).to.deep.equal(['broll.mp4', 'logo.png', 'notes.md', 'song.mp3', 'talk.mp4']);
    const talk = row(el, 'talk.mp4');
    expect(talk.querySelector('.media-row-meta').textContent).to.contain(
      '0:21 · 1280×720 · 30 fps',
    );
    expect(talk.querySelector('img').getAttribute('src')).to.contain('/api/previews/thumbnail');
    const states = [...talk.querySelectorAll('.media-row-badge')].map((b) => b.title);
    expect(states).to.include('Transcript: ready').and.to.include('Visual tags: not analysed yet');
    await waitUntil(() => row(el, 'song.mp3').querySelector('.media-row-badge-unavailable'));
    expect(row(el, 'notes.md').querySelector('.media-row-add')).to.equal(null);
    expect(el.querySelector('[role=listbox]').getAttribute('aria-label')).to.equal('Media files');
  });

  it('searches names and tags, filters by type and sorts', async () => {
    const el = await mount();
    const search = el.querySelector('media-toolbar input[type=search]');
    search.value = 'PARK';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await waitUntil(() => names(el).join() === 'talk.mp4', `got ${names(el)}`);
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    el.querySelector('media-toolbar button[data-type=video]').click();
    await waitUntil(() => names(el).join() === 'broll.mp4,talk.mp4', `got ${names(el)}`);
    expect(el.querySelector('media-footer').textContent).to.contain('2 of 5 files');
    el.querySelector('media-toolbar button[data-type=all]').click();
    const sort = el.querySelector('media-toolbar select');
    sort.value = 'duration';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    await waitUntil(() => names(el)[0] === 'song.mp3', `got ${names(el)}`);
  });

  it('renders only the rows in view, however long the list', async () => {
    const many = Array.from({ length: 600 }, (_, i) => mediaItem(`clip${i}.mp4`));
    const el = await mount(many);
    const list = el.querySelector('.media-bin-list');
    await waitUntil(() => el.viewHeight > 0);
    expect(el.querySelectorAll('media-row').length).to.be.below(40);
    expect(el.querySelector('.media-bin-sizer').style.height).to.equal(`${600 * 44}px`);
    list.scrollTop = 300 * 44;
    await waitUntil(() => names(el).includes('clip300.mp4'), 'did not follow the scroll');
    expect(el.querySelectorAll('media-row').length).to.be.below(40);
  });

  it('adds a file at the edit cursor as one undo step and selects it', async () => {
    const el = await mount();
    await store.set(ViewState, { cursorPosition: 3, playheadPosition: 3 });
    row(el, 'talk.mp4').querySelector('.media-row-add').click();
    const [picture] = getDoc().tracks[0].clips;
    const [sound] = getDoc().tracks[1].clips;
    expect([picture.sourceFile, picture.timelineStart]).to.deep.equal(['/media/talk.mp4', 3]);
    expect(sound.linkedClipId).to.equal(picture.clipId);
    await waitUntil(() => view().selection.length === 2);
    expect(view().selection).to.include(picture.clipId).and.to.include(sound.clipId);
    await waitUntil(() => Math.abs(view().cursorPosition - picture.timelineEnd) < 1e-9);
    expect(undo()).to.equal(true);
    expect(getDoc().tracks[0].clips.length).to.equal(0);
    expect(undo()).to.equal(false);
  });

  it('adds on double-click, and several picked files in pick order', async () => {
    const el = await mount();
    row(el, 'logo.png')
      .querySelector('.media-row')
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(getDoc().tracks[0].clips[0].sourceFile).to.equal('/media/logo.png');
    row(el, 'song.mp3').querySelector('.media-row').click();
    row(el, 'broll.mp4')
      .querySelector('.media-row')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await waitUntil(() => /2 selected/.test(el.querySelector('media-footer').textContent));
    el.querySelector('media-footer .media-footer-add').click();
    const song = getDoc().tracks[1].clips.find((c) => c.sourceFile === '/media/song.mp3');
    const broll = getDoc().tracks[0].clips.find((c) => c.sourceFile === '/media/broll.mp4');
    expect(broll.timelineStart).to.equal(song.timelineEnd);
  });

  it('drags a media item to the timeline under MEDIA_DRAG_TYPE', async () => {
    const el = await mount();
    const data = new DataTransfer();
    row(el, 'talk.mp4')
      .querySelector('.media-row')
      .dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }));
    const item = JSON.parse(data.getData(MEDIA_DRAG_TYPE));
    expect([item.filePath, item.type, item.duration]).to.deep.equal([
      '/media/talk.mp4',
      'video',
      21.4,
    ]);
    expect(row(el, 'notes.md').querySelector('.media-row').getAttribute('draggable')).to.equal(
      'false',
    );
  });

  it('opens a quick look with in/out marks that limit what is added', async () => {
    const el = await mount();
    row(el, 'talk.mp4').querySelector('.media-row').click();
    await waitUntil(() => el.querySelector('media-quicklook video'), 'no quick look');
    const look = el.querySelector('media-quicklook');
    look.time = 2;
    await waitUntil(() => el.querySelector('media-marks').time === 2);
    el.querySelector('media-marks [data-edge=in]').click();
    look.time = 6.5;
    await waitUntil(() => el.querySelector('media-marks').time === 6.5);
    el.querySelector('media-marks [data-edge=out]').click();
    await waitUntil(
      () => /part\s+4\.5 s/.test(row(el, 'talk.mp4').textContent),
      'row chip missing',
    );
    el.querySelector('media-marks .media-marks-add').click();
    const [clip] = getDoc().tracks[0].clips;
    expect([clip.sourceIn, clip.sourceOut]).to.deep.equal([2, 6.5]);
    el.querySelector('media-marks [data-edge=clear]').click();
  });

  it('names a missing provider plainly', async () => {
    const el = await mount();
    await waitUntil(() => el.querySelector('media-status .media-status-notice'), 'no notice');
    const notice = el.querySelector('media-status .media-status-notice').textContent;
    expect(notice).to.contain('Not available: transcription');
    expect(notice).to.contain('whisper-cli not found');
  });

  it('analyses the selection as a job, reports what was skipped and refreshes the badges', async () => {
    const result = {
      files: [
        {
          path: '/media/broll.mp4',
          steps: { probe: 'ok', scenes: 'ok', tags: 'skipped: no vision provider' },
        },
      ],
    };
    const job = {
      id: 'j1',
      type: 'analyze',
      status: 'complete',
      label: 'Analyze: 1 file',
      progress: 100,
      log: [],
    };
    const el = await mount(LIBRARY, {
      'POST /api/intelligence/analyze': () => {
        library = library.map((i) =>
          i.filename === 'broll.mp4' ? { ...i, analysis: { ...i.analysis, scenes: true } } : i,
        );
        return [202, { jobId: 'j1' }];
      },
      'GET /api/jobs/j1': job,
      'GET /api/jobs/j1/result': result,
    });
    row(el, 'broll.mp4').querySelector('.media-row').click();
    await waitUntil(() => !el.querySelector('media-status [data-scope=selected]').disabled);
    el.querySelector('media-status [data-scope=selected]').click();
    await waitUntil(
      () => /Analysed 1 file/.test(el.querySelector('media-status').textContent),
      'no outcome',
      { timeout: 4000 },
    );
    expect(el.querySelector('media-status').textContent).to.contain(
      'Visual tagging skipped — no vision provider',
    );
    const request = server.calls.find((c) => c.path === '/api/intelligence/analyze');
    expect(request.body).to.deep.equal({ projectId: 'p1', paths: ['/media/broll.mp4'] });
    server.push({ type: 'job_update', job });
    await waitUntil(
      () => row(el, 'broll.mp4').item.analysis.scenes === true,
      'library not reloaded',
      { timeout: 4000 },
    );
    expect(row(el, 'broll.mp4').querySelector('[title="Scenes: ready"]')).to.exist;
  });
});
