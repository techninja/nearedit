import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { clearProbeCache, probeCacheStats } from '../../src/api/lib/probeCache.js';
import { writeSidecar } from '../../src/api/lib/sidecar.js';
import { mediaRouter } from '../../src/api/media.js';
import { projectsRouter } from '../../src/api/projects.js';
import { call, createSandbox, makeMedia, q, serve } from './helpers.js';

let box;
let api;
let media;
let project;
const list = async (projectId = project.id) => {
  const res = await call(api.url, 'GET', `/api/media?projectId=${projectId}`);
  assert.equal(res.status, 200);
  return res.body;
};
const named = (items, filename) => items.find((item) => item.filename === filename);
/** Move a file's mtime forward, as an edit would. */
const touch = (file) => {
  const later = new Date(statSync(file).mtimeMs + 5000);
  utimesSync(file, later, later);
};

before(async () => {
  box = createSandbox('media');
  mkdirSync(join(box.project, 'day1'));
  media = makeMedia(box.project);
  copyFileSync(media.video, join(box.project, 'day1', 'park.mp4'));
  mkdirSync(join(box.project, '.hidden'));
  copyFileSync(media.image, join(box.project, '.hidden', 'skip.png'));
  api = await serve(projectsRouter, mediaRouter);
  const res = await call(api.url, 'POST', '/api/projects', { name: 'Park', path: box.project });
  project = res.body;
});
after(async () => {
  await api?.close();
  box?.cleanup();
});

describe('GET /media', () => {
  it('lists every media file as a MediaItem, sorted by relative path', async () => {
    const { data, total } = await list();
    assert.equal(total, 5);
    assert.deepEqual(
      data.map((item) => item.relativePath),
      ['clip.mp4', 'day1/park.mp4', 'notes.md', 'still.png', 'tone.mp3'],
    );
    const video = named(data, 'clip.mp4');
    assert.deepEqual(Object.keys(video).sort(), [
      'analysis',
      'duration',
      'filePath',
      'filename',
      'fps',
      'global',
      'hasAudio',
      'height',
      'indexed',
      'mtime',
      'relativePath',
      'rotation',
      'size',
      'tags',
      'type',
      'width',
    ]);
    assert.equal(video.filePath, media.video);
    assert.equal(video.size, statSync(media.video).size);
    assert.deepEqual(
      [video.type, video.global, video.width, video.height, video.fps, video.hasAudio],
      ['video', false, 320, 180, 30, true],
    );
    assert.ok(Math.abs(video.duration - 2.5) < 0.1, `duration ${video.duration}`);
    assert.deepEqual([video.indexed, video.tags], [false, []]);
    assert.deepEqual(video.analysis, {
      transcript: false,
      tags: false,
      beats: false,
      scenes: false,
      silences: false,
    });
  });

  it('describes audio, stills and text by what they are', async () => {
    const { data } = await list();
    const audio = named(data, 'tone.mp3');
    assert.deepEqual(
      [audio.type, audio.width, audio.height, audio.fps, audio.hasAudio],
      ['audio', null, null, null, true],
    );
    assert.ok(Math.abs(audio.duration - 2) < 0.15, `duration ${audio.duration}`);
    const image = named(data, 'still.png');
    assert.deepEqual(
      [image.type, image.width, image.height, image.duration, image.fps, image.hasAudio],
      ['image', 200, 120, null, null, false],
    );
    const text = named(data, 'notes.md');
    assert.deepEqual(
      [text.type, text.duration, text.width, text.hasAudio],
      ['text', null, null, false],
    );
  });

  it('probes each file once and answers later listings from the cache', async () => {
    clearProbeCache();
    await list();
    const first = probeCacheStats();
    assert.equal(first.probes, 4, 'two videos, one audio file and one image; text is never probed');
    await list();
    await list();
    assert.equal(probeCacheStats().probes, 4);
    assert.ok(probeCacheStats().hits >= 8);

    touch(media.audio);
    await list();
    assert.equal(probeCacheStats().probes, 5, 'only the edited file is probed again');
  });

  it('shares one probe between listings that overlap', async () => {
    clearProbeCache();
    await Promise.all([list(), list(), list()]);
    assert.equal(probeCacheStats().probes, 4);
  });

  it('takes metadata from a fresh sidecar without probing the file', async () => {
    writeSidecar(media.video, {
      type: 'video',
      duration: 99,
      width: 3840,
      height: 2160,
      fps: 60,
      hasAudio: false,
      hasVideo: true,
      tags: ['park', 'dog'],
      transcript: [{ word: 'hello', start: 0.5, end: 0.8 }],
      scenes: [],
      beats: null,
    });
    clearProbeCache();
    const video = named((await list()).data, 'clip.mp4');
    assert.deepEqual(
      [video.duration, video.width, video.height, video.fps, video.hasAudio],
      [99, 3840, 2160, 60, false],
    );
    assert.deepEqual([video.indexed, video.tags], [true, ['park', 'dog']]);
    assert.deepEqual(video.analysis, {
      transcript: true,
      tags: true,
      beats: false,
      scenes: true,
      silences: false,
    });
    assert.equal(probeCacheStats().probes, 3, 'the indexed file was not probed');
    assert.ok(!readdirSync(box.project).some((name) => name.endsWith('.nearedit.json.tmp')));
  });

  it('ignores a sidecar that is older than its source file', async () => {
    touch(media.video);
    const video = named((await list()).data, 'clip.mp4');
    assert.equal(video.indexed, false);
    assert.equal(video.width, 320);
    assert.deepEqual(video.tags, []);
  });

  it('probes when a sidecar holds no probe data (user tags only)', async () => {
    writeSidecar(media.image, { tags: ['logo'] });
    const image = named((await list()).data, 'still.png');
    assert.deepEqual([image.indexed, image.tags, image.width], [true, ['logo'], 200]);
  });

  it('lists extra media folders and global media', async () => {
    const footage = join(box.home, 'footage');
    const shared = join(box.root, 'shared');
    mkdirSync(footage);
    mkdirSync(shared);
    copyFileSync(media.audio, join(footage, 'voice.mp3'));
    copyFileSync(media.image, join(shared, 'logo.png'));
    await call(api.url, 'PUT', `/api/projects/${project.id}`, { mediaFolders: [footage] });
    process.env.GLOBAL_MEDIA_PATHS = shared;
    try {
      const { data, total } = await list();
      assert.equal(total, 7);
      assert.equal(named(data, 'voice.mp3').global, false);
      assert.equal(named(data, 'logo.png').global, true);
      const file = await call(api.url, 'GET', `/api/media/file${q(join(shared, 'logo.png'))}`);
      assert.equal(file.status, 200, 'global media is inside the allowed roots');
    } finally {
      process.env.GLOBAL_MEDIA_PATHS = '';
    }
  });

  it('lists the dev media folder when no project is given, 404 for an unknown one', async () => {
    copyFileSync(media.image, join(box.devMedia, 'dev.png'));
    const dev = await list('');
    assert.deepEqual(
      dev.data.map((item) => item.filename),
      ['dev.png'],
    );
    assert.equal((await call(api.url, 'GET', '/api/media?projectId=nope')).status, 404);
  });
});
