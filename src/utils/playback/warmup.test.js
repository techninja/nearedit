import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip, createTrack } from '#utils/edl/factory.js';
import { renditionUrls, warmAudio } from './warmup.js';

const clip = (sourceFile) => createClip({ sourceFile, timelineStart: 0, timelineEnd: 1 });
const doc = (...audioFiles) => [
  createTrack('video', { clips: [clip('/m/picture.mp4'), clip('/m/on-video-track.mp3')] }),
  createTrack('audio', { clips: audioFiles.map(clip) }),
];

describe('renditionUrls', () => {
  it('lists compressed audio on audio tracks, once each', () => {
    const urls = renditionUrls(
      doc('/m/a.mp3', '/m/b.wav', '/m/a.mp3', '/m/c.m4a', '/m/talk.mp4', ''),
    );
    assert.deepEqual(urls, [
      '/api/transcode?path=%2Fm%2Fa.mp3',
      '/api/transcode?path=%2Fm%2Fc.m4a',
    ]);
  });

  it('copes with an empty or missing document', () => {
    assert.deepEqual(renditionUrls([]), []);
    assert.deepEqual(renditionUrls(undefined), []);
  });
});

describe('warmAudio', () => {
  const calls = [];
  const request = (url, init) => {
    calls.push([url, init.method]);
    return url.includes('offline')
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ ok: true });
  };

  it('asks for each rendition once, with HEAD', () => {
    const tracks = doc('/m/one.mp3', '/m/two.ogg');
    assert.equal(warmAudio(tracks, request), 2);
    assert.deepEqual(calls, [
      ['/api/transcode?path=%2Fm%2Fone.mp3', 'HEAD'],
      ['/api/transcode?path=%2Fm%2Ftwo.ogg', 'HEAD'],
    ]);
  });

  it('does nothing for the same document, or for sources already asked for', () => {
    const tracks = doc('/m/one.mp3', '/m/three.flac');
    calls.length = 0;
    assert.equal(warmAudio(tracks, request), 1);
    assert.equal(warmAudio(tracks, request), 0);
    assert.deepEqual(calls, [['/api/transcode?path=%2Fm%2Fthree.flac', 'HEAD']]);
  });

  it('retries a source after a network failure', async () => {
    calls.length = 0;
    assert.equal(warmAudio(doc('/m/offline.mp3'), request), 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(warmAudio(doc('/m/offline.mp3'), request), 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
});
