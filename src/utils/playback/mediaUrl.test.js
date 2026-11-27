import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  audioUrl,
  fileExtension,
  mediaFileUrl,
  needsTranscode,
  pictureUrl,
  transcodeUrl,
} from './mediaUrl.js';

describe('fileExtension', () => {
  it('returns the lower-cased extension', () => {
    assert.equal(fileExtension('/a/b/Song.MP3'), 'mp3');
    assert.equal(fileExtension('/a/b/clip.final.mov'), 'mov');
    assert.equal(fileExtension('C:\\media\\take.WAV'), 'wav');
  });

  it('ignores dots in folders, dotfiles and missing input', () => {
    assert.equal(fileExtension('/a.b/c'), '');
    assert.equal(fileExtension('/a/.hidden'), '');
    assert.equal(fileExtension(''), '');
    assert.equal(fileExtension(undefined), '');
  });
});

describe('media urls', () => {
  it('encodes the absolute path as one query value', () => {
    const path = '/media/day 1/kids & dog #2?.mp4';
    const url = mediaFileUrl(path);
    assert.ok(url.startsWith('/api/media/file?path='));
    assert.equal(new URL(url, 'http://x').searchParams.get('path'), path);
    assert.equal(new URL(transcodeUrl(path), 'http://x').searchParams.get('path'), path);
  });

  it('plays compressed audio from the WAV rendition', () => {
    for (const ext of ['mp3', 'aac', 'ogg', 'flac', 'm4a', 'MP3']) {
      assert.ok(needsTranscode(`/m/a.${ext}`), ext);
      assert.equal(audioUrl(`/m/a.${ext}`), `/api/transcode?path=%2Fm%2Fa.${ext}`);
    }
  });

  it('plays WAV and the sound of video containers from the file itself', () => {
    for (const ext of ['wav', 'mp4', 'mov', 'mkv', 'webm']) {
      assert.equal(needsTranscode(`/m/a.${ext}`), false, ext);
      assert.equal(audioUrl(`/m/a.${ext}`), `/api/media/file?path=%2Fm%2Fa.${ext}`);
    }
  });

  it('always reads picture from the file itself', () => {
    assert.equal(pictureUrl('/m/still.png'), '/api/media/file?path=%2Fm%2Fstill.png');
    assert.equal(pictureUrl('/m/v.mp4'), mediaFileUrl('/m/v.mp4'));
  });
});
