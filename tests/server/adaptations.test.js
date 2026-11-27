import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { projectsRouter } from '../../src/api/projects.js';
import { checkEdl } from '../../src/api/projects/edlGuard.js';
import * as E from '../../src/utils/edl/index.js';
import { call, createSandbox, serve } from './helpers.js';

let box;
let api;
let project;
let main;
const base = () => `/api/projects/${project.id}`;
const onDisk = () =>
  JSON.parse(readFileSync(join(box.project, '.nearedit', 'project.json'), 'utf-8'));
const clip = (overrides = {}) => ({
  clipId: 'c1',
  sourceFile: '/media/a.mp4',
  sourceIn: 0,
  sourceOut: 2,
  timelineStart: 0,
  timelineEnd: 2,
  ...overrides,
});
const edlWith = (clips) => ({
  version: 2,
  fps: 30,
  resolution: '1920x1080',
  tracks: [
    { trackId: 'v1', type: 'video', name: 'Video 1', clips },
    { trackId: 'a1', type: 'audio', name: 'Audio 1', clips: [] },
  ],
  markers: [{ markerId: 'm_1', time: 1.5, label: 'Chorus', color: '' }],
});

before(async () => {
  box = createSandbox('adaptations');
  api = await serve(projectsRouter);
  const res = await call(api.url, 'POST', '/api/projects', { name: 'Park', path: box.project });
  project = res.body;
  main = project.adaptations[0];
});
after(async () => {
  await api?.close();
  box?.cleanup();
});

describe('adaptations', () => {
  it('derives the resolution from the aspect ratio', async () => {
    const expected = {
      '16:9': '1920x1080',
      '9:16': '1080x1920',
      '1:1': '1080x1080',
      '4:5': '1080x1350',
      '4:3': '1440x1080',
      '21:9': '2560x1080',
    };
    for (const [aspectRatio, resolution] of Object.entries(expected)) {
      const body = { name: `Cut ${aspectRatio}`, aspectRatio };
      const res = await call(api.url, 'POST', `${base()}/adaptations`, body);
      assert.equal(res.status, 201, aspectRatio);
      assert.equal(res.body.resolution, resolution);
      assert.equal(res.body.fps, 30);
      assert.equal(res.body.projectId, project.id);
      assert.equal(res.body.edl, undefined);
    }
    const stored = onDisk().adaptations.find((a) => a.aspectRatio === '9:16');
    assert.equal(stored.edl.resolution, '1080x1920');
    assert.equal(stored.edl.version, 3);
  });

  it('accepts an explicit resolution and names its ratio', async () => {
    const post = (body) => call(api.url, 'POST', `${base()}/adaptations`, body);
    const hd = await post({ name: '720p', resolution: '1280x720', fps: 60 });
    assert.deepEqual(
      [hd.body.aspectRatio, hd.body.resolution, hd.body.fps],
      ['16:9', '1280x720', 60],
    );
    const odd = await post({ name: 'Banner', aspectRatio: 'custom', resolution: '1200x300' });
    assert.deepEqual([odd.status, odd.body.aspectRatio], [201, 'custom']);
  });

  it('validates new adaptations (422) and unknown projects (404)', async () => {
    const post = (body) => call(api.url, 'POST', `${base()}/adaptations`, body);
    for (const body of [
      { aspectRatio: '9:16' },
      { name: 'A', aspectRatio: '3:2' },
      { name: 'A', aspectRatio: 'custom' },
      { name: 'A', resolution: 'big' },
      { name: 'A', fps: 0 },
      { name: 'A', aspectRatio: '9:16', resolution: '1920x1080' },
      { name: 'A', parentAdaptationId: 'missing' },
      { name: 'A', copyFrom: 'missing' },
    ]) {
      const res = await post(body);
      assert.equal(res.status, 422, JSON.stringify(body));
      assert.ok(Object.keys(res.body.fields).length);
    }
    const res = await call(api.url, 'POST', '/api/projects/nope/adaptations', { name: 'A' });
    assert.equal(res.status, 404);
  });

  it('copyFrom deep-copies the source EDL', async () => {
    await call(api.url, 'PUT', `${base()}/edl/${main.id}`, edlWith([clip()]));
    const body = {
      name: 'Reel',
      aspectRatio: '9:16',
      copyFrom: main.id,
      parentAdaptationId: main.id,
    };
    const reel = (await call(api.url, 'POST', `${base()}/adaptations`, body)).body;
    assert.equal(reel.parentAdaptationId, main.id);
    const copied = (await call(api.url, 'GET', `${base()}/edl/${reel.id}`)).body;
    assert.equal(copied.tracks[0].clips[0].clipId, 'c1');
    assert.equal(copied.resolution, '1080x1920', 'the copy takes the new frame size');
    assert.equal(copied.markers[0].label, 'Chorus');

    copied.tracks[0].clips[0].timelineEnd = 1;
    copied.tracks[0].clips.push(clip({ clipId: 'c2', timelineStart: 1, timelineEnd: 3 }));
    await call(api.url, 'PUT', `${base()}/edl/${reel.id}`, copied);
    const source = (await call(api.url, 'GET', `${base()}/edl/${main.id}`)).body;
    assert.equal(source.tracks[0].clips.length, 1);
    assert.equal(source.tracks[0].clips[0].timelineEnd, 2, 'the source is untouched');
  });

  it('updates settings and writes frame size and rate through to the EDL', async () => {
    const put = (body) => call(api.url, 'PUT', `${base()}/adaptations/${main.id}`, body);
    const res = await put({ name: 'Long form', status: 'review', fps: 24, aspectRatio: '4:3' });
    assert.equal(res.status, 200);
    assert.deepEqual(
      [res.body.name, res.body.status, res.body.fps, res.body.resolution],
      ['Long form', 'review', 24, '1440x1080'],
    );
    const edl = (await call(api.url, 'GET', `${base()}/edl/${main.id}`)).body;
    assert.deepEqual([edl.fps, edl.resolution], [24, '1440x1080']);
    assert.equal(edl.tracks[0].clips.length, 1, 'clips survive a settings change');
    assert.equal((await put({ status: 'shipped' })).status, 422);
    const missing = await call(api.url, 'PUT', `${base()}/adaptations/nope`, { name: 'x' });
    assert.equal(missing.status, 404);
  });

  it('re-parents children when an adaptation is deleted', async () => {
    const post = (body) => call(api.url, 'POST', `${base()}/adaptations`, body);
    const middle = (await post({ name: 'Middle', parentAdaptationId: main.id })).body;
    const leaf = (await post({ name: 'Leaf', parentAdaptationId: middle.id })).body;
    const res = await call(api.url, 'DELETE', `${base()}/adaptations/${middle.id}`);
    assert.equal(res.status, 204);
    const after = (await call(api.url, 'GET', base())).body.adaptations;
    assert.equal(after.find((a) => a.id === leaf.id).parentAdaptationId, main.id);
    assert.ok(!after.some((a) => a.id === middle.id));
    const gone = await call(api.url, 'DELETE', `${base()}/adaptations/${middle.id}`);
    assert.equal(gone.status, 404);
  });

  it('refuses to delete the last adaptation (409)', async () => {
    const all = (await call(api.url, 'GET', base())).body.adaptations;
    for (const adaptation of all.slice(1)) {
      const res = await call(api.url, 'DELETE', `${base()}/adaptations/${adaptation.id}`);
      assert.equal(res.status, 204);
    }
    const last = await call(api.url, 'DELETE', `${base()}/adaptations/${all[0].id}`);
    assert.equal(last.status, 409);
    assert.equal((await call(api.url, 'GET', base())).body.adaptations.length, 1);
  });
});

describe('EDL documents', () => {
  it('round-trips a v2 document and stamps it as v3', async () => {
    const doc = edlWith([clip(), clip({ clipId: 'c2', timelineStart: 2, timelineEnd: 4 })]);
    const saved = await call(api.url, 'PUT', `${base()}/edl/${main.id}`, { ...doc, zoom: 3 });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.adaptationId, main.id);
    const loaded = (await call(api.url, 'GET', `${base()}/edl/${main.id}`)).body;
    // Documents come back normalised: the fields that were sent survive and
    // every clip is filled out to the full v3 shape.
    const sent = doc.tracks.flatMap((t) => t.clips);
    const got = loaded.tracks.flatMap((t) => t.clips);
    assert.deepEqual(
      got.map((c) => [c.clipId, c.sourceFile, c.timelineStart, c.timelineEnd]),
      sent.map((c) => [c.clipId, c.sourceFile, c.timelineStart, c.timelineEnd]),
    );
    assert.ok(got.every((c) => c.transform.fit === 'cover' && c.text.content === ''));
    assert.deepEqual(loaded.markers, doc.markers);
    assert.deepEqual([loaded.version, loaded.zoom, loaded.playheadPosition], [3, 3, 0]);
    assert.deepEqual(readdirSync(join(box.project, '.nearedit')), ['project.json']);
  });

  it('fills the document fields of a v1 EDL from the adaptation', async () => {
    const v1 = { tracks: [{ trackId: 'v1', type: 'video', clips: [clip()] }], zoom: 2 };
    await call(api.url, 'PUT', `${base()}/adaptations/${main.id}`, { resolution: '1280x720' });
    assert.equal((await call(api.url, 'PUT', `${base()}/edl/${main.id}`, v1)).status, 200);
    const loaded = (await call(api.url, 'GET', `${base()}/edl/${main.id}`)).body;
    assert.deepEqual(
      [loaded.version, loaded.resolution, loaded.markers, loaded.zoom],
      [3, '1280x720', [], 2],
    );
  });

  it('keeps the adaptation in step when the EDL changes frame size or rate', async () => {
    const doc = { ...edlWith([]), fps: 25, resolution: '1080x1920' };
    await call(api.url, 'PUT', `${base()}/edl/${main.id}`, doc);
    const adaptation = (await call(api.url, 'GET', base())).body.adaptations[0];
    assert.deepEqual(
      [adaptation.fps, adaptation.resolution, adaptation.aspectRatio],
      [25, '1080x1920', '9:16'],
    );
  });

  it('saves and loads a v3 document with nothing lost', async () => {
    let doc = E.createEdl({ fps: 25, resolution: '1080x1920', background: '#102030' });
    doc = E.insertGenerator(doc, {
      type: 'particles',
      seed: 7,
      params: { rate: 60, at: { x: 0.5 } },
    });
    const [id] = E.newClipIds(E.createEdl(), doc);
    doc = E.addEffect(doc, { clipId: id }, 'glow', { effectId: 'fx', params: { radius: 9 } });
    doc = E.setKeyframe(doc, id, 'effects.fx.radius', 1, 30, { ease: 'ease-out' });
    doc = E.setKeyframe(E.trimClipStart(doc, id, 2), id, 'transform.x', 2, -400);
    doc = E.updateClip(doc, id, { blendMode: 'add', fadeOutCurve: 'smooth' });
    doc = E.insertTitle(doc, { text: { content: 'Hi', weight: 900, animateIn: { type: 'fade' } } });
    doc = E.addEffect(E.setTrackOpacity(doc, 'v1', 0.5), { trackId: 'v1' }, 'vignette');
    doc = { ...doc, regions: [{ regionId: 'r', start: 1, end: 2, label: 'Verse', color: '' }] };
    const put = await call(api.url, 'PUT', `${base()}/edl/${main.id}`, E.toSavedDocument(doc));
    assert.equal(put.status, 200);
    const loaded = (await call(api.url, 'GET', `${base()}/edl/${main.id}`)).body;
    assert.deepEqual(E.fromSavedDocument(loaded).edl, doc);
    assert.deepEqual([loaded.tracks, loaded.background], [doc.tracks, '#102030'], 'as served');
    assert.deepEqual(onDisk().adaptations[0].edl.tracks, doc.tracks, 'and as stored on disk');
  });

  it('cleans free-form parameters and migrates clips of older documents', async () => {
    const params = JSON.parse('{"__proto__": {"x": 1}, "rate": 5, "deep": {"bad": null}}');
    const gen = clip({ sourceFile: '', sourceIn: -3, generator: { type: 'noise', params } });
    const title = clip({ clipId: 't', sourceFile: '', sourceIn: 7, text: { content: 'Old' } });
    const put = (doc) => call(api.url, 'PUT', `${base()}/edl/${main.id}`, doc);
    const got = async () => (await call(api.url, 'GET', `${base()}/edl/${main.id}`)).body;
    assert.equal((await put({ ...edlWith([gen]), version: 3 })).status, 200);
    const [kept] = (await got()).tracks[0].clips;
    assert.deepEqual([kept.generator.params, kept.sourceIn], [{ rate: 5, deep: {} }, -3]);
    assert.equal((await put(edlWith([title]))).status, 200, 'a v2 document');
    const [old] = (await got()).tracks[0].clips;
    assert.deepEqual([old.sourceIn, old.sourceOut, old.text.lineHeight], [0, 2, 1.2]);
  });

  it('refuses structurally broken documents (422) and leaves the saved one alone', async () => {
    const before = onDisk().adaptations[0].edl;
    const put = (doc) => call(api.url, 'PUT', `${base()}/edl/${main.id}`, doc);
    const broken = [
      {},
      [],
      { tracks: 'none' },
      { tracks: [null] },
      { tracks: [{ type: 'video', clips: [] }] },
      { tracks: [{ trackId: 'v1', type: 'subtitle', clips: [] }] },
      { tracks: [{ trackId: 'v1', type: 'video' }] },
      edlWith([clip({ timelineStart: null })]),
      edlWith([clip({ sourceOut: '2' })]),
      edlWith([clip({ clipId: '' })]),
      edlWith([clip({ fadeIn: 'slow' })]),
      edlWith([clip({ effects: 'blur' })]),
      edlWith([clip({ keyframes: { 'transform.x': [{ t: null, v: 1 }] } })]),
      edlWith([clip({ keyframes: ['transform.x'] }), clip({ generator: 'noise' })]),
      { ...edlWith([]), fps: -1 },
      { ...edlWith([]), resolution: 'wide' },
      { ...edlWith([]), markers: [{ label: 'no time' }] },
    ];
    for (const doc of broken) {
      const res = await put(doc);
      assert.equal(res.status, 422, JSON.stringify(doc).slice(0, 80));
      assert.equal(res.body.error, 'Invalid EDL document');
      assert.ok(Object.keys(res.body.fields).length);
    }
    const nan = await put(edlWith([clip({ timelineEnd: NaN })])); // NaN serialises to null
    assert.match(nan.body.detail, /tracks\[0\]\.clips\[0\]\.timelineEnd must be a finite number/);
    assert.deepEqual(onDisk().adaptations[0].edl, before);
  });

  it('answers 404 for an unknown project or adaptation', async () => {
    assert.equal((await call(api.url, 'GET', `${base()}/edl/nope`)).status, 404);
    assert.equal((await call(api.url, 'PUT', `${base()}/edl/nope`, edlWith([]))).status, 404);
    assert.equal((await call(api.url, 'GET', `/api/projects/nope/edl/${main.id}`)).status, 404);
  });

  it('checkEdl accepts a sound document and caps its problem list', () => {
    assert.deepEqual(checkEdl(edlWith([clip()])), {});
    assert.deepEqual(checkEdl({ tracks: [] }), {});
    const many = Array.from({ length: 500 }, () => clip({ sourceIn: null, sourceOut: null }));
    const problems = Object.keys(checkEdl(edlWith(many)));
    assert.ok(problems.length >= 20 && problems.length <= 22, `${problems.length} problems`);
  });
});
